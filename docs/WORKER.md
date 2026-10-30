# Running the Cinder Worker

Vercel serves the website and APIs, but it can't keep a process running, so Cinder's scheduler
(`scripts/worker.js`) has to run on an **always-on host**. Without it the live site still works,
but nothing is published or traded automatically.

## What the worker does

| Schedule (UTC) | Job |
|---|---|
| On start | Fetch news, ETF flows and sectors; update narrative temperatures; publish a Market Pulse / Deep Dive **only if none in the last 4h / 24h** |
| Every hour | News fetch + AI classification, narrative temperatures, shift detection, **autonomous trading** (if enabled) |
| Every 4 hours | ETF flows, sector performance, Market Pulse story |
| 08:00 daily | Daily Deep Dive story + Telegram daily digest |
| Every 5 minutes | Trailing stop-loss checks (can place SELL orders) |
| 00:00 daily | Prune old news and ETF flows |

A job that is still running when its next turn comes is **skipped**, never run twice at once.

> **Costs and trading.** Starting the worker starts hourly LLM calls (classifying up to 50 news
> items, writing stories). If `AUTO_TRADE_ENABLED=true`, it also trades on SoDEX on its own.
> Start with `AUTO_TRADE_ENABLED=false` (see "Turning it on safely").

## Requirements

- **Node.js 22 or newer.** The worker relies on Node detecting ES modules automatically.
  (A harmless `MODULE_TYPELESS_PACKAGE_JSON` warning at startup is expected.)
- **A host that never sleeps.** Free tiers that spin down when idle (e.g. sleeping web services)
  will miss jobs. Use a background-worker service, an always-on container, or a small VPS.
- **Exactly one worker.** Two workers would publish duplicate stories and could place duplicate trades.
  Don't run `npm run dev` against the production database while the worker runs: dev mode starts
  its own scheduler.

## Environment variables

Copy these from Vercel (Project → Settings → Environment Variables). The worker doesn't need the
`INTERNAL_API_SECRET` or the other `NEXT_PUBLIC_*` variables, but it does need `NEXT_PUBLIC_SODEX_NETWORK`.

| Variable | Needed |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | **Yes.** Same database as the site. |
| `SOSOVALUE_API_KEY` | **Yes** |
| `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`, `OPENAI_MODEL` if you use them) | **Yes** |
| `SODEX_API_KEY_NAME`, `SODEX_API_KEY_PRIVATE_KEY`, `USER_WALLET_ADDRESS` | For trading and stop-losses. Create the key with `scripts/register-sodex-api-key.js` on your own computer. |
| `NEXT_PUBLIC_SODEX_NETWORK` | `testnet` or `mainnet`; must match the site. Testnet when unset. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | For alerts and the daily digest |
| `AUTO_TRADE_ENABLED`, `MAX_ALLOCATION_PER_TRADE`, `STOP_LOSS_PERCENTAGE`, `COOLDOWN_HOURS`, `QTY_DECIMALS` | Risk settings (same values as Vercel) |
| `EDGE_CONFIG`, `KILL_SWITCH_FAIL_CLOSED` | If you use the Edge Config kill switch |
| `NEWS_TTL_HOURS`, `ETF_FLOWS_TTL_HOURS` | Optional |
| `PORT` | Optional. Serves `GET /health`. Many hosts set it automatically. |
| `WORKER_SHUTDOWN_GRACE_MS` | Optional. How long a running job may finish on shutdown (default `60000`). |

`NODE_ENV` is set to `production` automatically when `TURSO_DATABASE_URL` is present, so the
worker never silently falls back to a local SQLite file.

## Install and start

Same commands on every host:

```bash
npm ci
npm run worker
```

No build step is needed. Configure the host to **restart the process if it exits**.

## Host notes

**Railway / Render / similar platforms**
- Create a service from the GitHub repo (`Turnless/Cinder`, branch `main`).
- Service type: a *background worker* (no public URL needed), or a web service that never sleeps.
- Build command: `npm ci`. Start command: `npm run worker`. Node version: 22.
- If the platform supports health checks and sets `PORT`, point the check at `/health`.
- If you can set how long the platform waits after stopping a deploy, make it at least
  `WORKER_SHUTDOWN_GRACE_MS` so a running trade or stop-loss can finish.
- Turn off auto-deploy for preview branches: only `main` should run a worker.

**VPS (systemd)**

```ini
# /etc/systemd/system/cinder-worker.service
[Unit]
Description=Cinder scheduler worker
After=network-online.target

[Service]
WorkingDirectory=/opt/cinder
EnvironmentFile=/opt/cinder/.env.worker
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=90

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now cinder-worker
journalctl -u cinder-worker -f
```

## Turning it on safely

1. Start with `AUTO_TRADE_ENABLED=false`.
2. Watch the first startup in the logs: migrations, `Cinder Background Scheduler Worker Active`,
   then the initial sync. New stories should appear on the site.
3. Leave it for a few hours. Each hour should log `Running hourly news fetch and narrative
   intelligence cycle` and either `Market is stable` or a detected shift.
4. Check `/health` (if enabled): every job shows `lastError: null` and sensible `lastDurationMs`.
5. Only then set `AUTO_TRADE_ENABLED=true` (keep `NEXT_PUBLIC_SODEX_NETWORK=testnet`) and restart.

## Stopping and pausing

- **Pause trading, keep publishing:** send `/pause` to the Telegram bot from the admin chat
  (`TELEGRAM_CHAT_ID`); `/resume` undoes it and `/status` shows the state. The pause is stored in
  the database, so the worker picks it up on its next trade or stop-loss check. It blocks
  autonomous trades **and** stop-loss sells. If the bot replies "Pause NOT saved", use one of the
  other switches: the Edge Config `trading_paused` key, or `AUTO_TRADE_ENABLED=false` plus a restart.
- **Stop everything:** stop the service. On `SIGTERM`/`SIGINT` the worker stops scheduling new
  runs, waits up to `WORKER_SHUTDOWN_GRACE_MS` for running jobs, then exits.

## Health endpoint

With `PORT` set, `GET /health` returns:

```json
{
  "status": "ok",
  "startedAt": "2026-10-19T21:15:32.142Z",
  "jobs": {
    "stopLossMonitoring": { "running": false, "runs": 12, "skipped": 0, "lastError": null, "lastDurationMs": 840 }
  }
}
```

A growing `skipped` count means a job is regularly taking longer than its interval (usually slow
network or RPC); `lastError` holds the most recent failure.
