<p align="center">
  <h1 align="center">Cinder</h1>
  <p align="center"><strong>The AI Newsroom That Trades Its Own Stories</strong></p>
  <p align="center">
    An autonomous financial wire service that publishes AI-written market intelligence<br/>
    from SoSoValue data, detects narrative regime shifts, and auto-executes trades on SoDEX.<br/>
    Built in 96hrs for <a href="https://x.com/SoSoValueCrypto/status/2085969681979162954?s=20">SosoValue Hackathon</a> in last wave, Ranked 24th overall.
  </p>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#api-integration">API Integration</a> •
  <a href="#demo">Demo</a> •
  <a href="#license">License</a>
</p>

---

## The Problem

Crypto traders face three compounding problems:

1. **Information overload** — Thousands of data points (ETF flows, sector performance, news) arrive every hour. No human can process it all.
2. **Narrative blindness** — Markets move on *stories*, not just numbers. "AI rotation," "institutional accumulation," "regulatory fear" — these narratives drive price before indicators catch up. But detecting narrative shifts requires reading hundreds of articles.
3. **Execution delay** — Even when a trader spots a shift, the manual process of analysis → decision → execution takes hours or days. By then, the move has happened.

## The Solution

**Cinder** solves all three by combining an **AI financial wire service** with a **narrative regime detection engine** and an **automated trading executor**:

| Layer | What It Does | How |
|---|---|---|
| 📰 **Wire Layer** | Publishes institutional-grade market reports 24/7 | AI generates stories from SoSoValue's ETF flow, sector, and AI news data |
| 🧠 **Narrative Layer** | Detects when the dominant market story is changing | NLP pipeline classifies narrative regimes and tracks temperature shifts |
| ⚡ **Execution Layer** | Trades the narrative shift before the crowd | Auto-executes on SoDEX with risk controls, stop-losses, and human override |

> **The key insight:** The published news articles *are* the trade rationale. Every trade Cinder makes has a corresponding article explaining exactly why. Full transparency — no black-box trading.

---

## Features

### 📰 Autonomous Wire Service
- **Market Pulse** reports published every 4 hours with ETF flow summaries, sector movers, and AI-generated analysis
- **Daily Deep Dives** — long-form institutional reports with charts, data tables, and trade recommendations
- **Breaking Alerts** — published immediately when a narrative regime shift is detected
- All stories auto-generated from live SoSoValue API data — zero human writers
- Embedded interactive charts (ETF flow trends, sector heatmaps, narrative timelines)
- Telegram alerts for subscribers

### 🧠 Narrative Intelligence Engine
- Real-time **Narrative Temperature** tracking (0–100°) for 8+ recurring crypto narrative archetypes
- Multi-signal detection using three independent SoSoValue data streams:
  - **News NLP**: Topic extraction and keyword frequency analysis from SoSoValue's AI news feed
  - **Flow Analysis**: ETF inflow/outflow trend direction and acceleration
  - **Sector Rotation**: SSI index relative performance and cross-sector correlation
- **Narrative Shift Detection** — triggers when a dominant narrative cools while an emerging one heats up
- **Confidence Scoring** — requires ≥80% confidence and 2+ signal agreement before any trade action
- Interactive **Narrative Bubble Map** visualization showing all tracked narratives and their temperatures in real-time
- Historical **Narrative Timeline** — scrollable view of past regime shifts with portfolio performance overlay

### ⚡ SoDEX Trade Execution
- Auto-executes portfolio rebalancing on SoDEX when narrative shift confidence exceeds threshold
- **Risk Controls:**
  - Maximum 30% portfolio allocation per narrative trade
  - Trailing stop-loss at -8% from entry
  - 48-hour cooldown between consecutive narrative trades
  - Multi-signal confirmation required (no single-signal trades)
  - One-click human override to pause auto-trading
- Trade confirmation published as a "Breaking" story with full reasoning
- Real-time portfolio dashboard with positions, PnL, and allocation breakdown
- Trade history linked to the stories that triggered each trade

### 🦊 Web3 Wallet Provider Integration
- Detects injected browser wallets (MetaMask, Rabby, Coinbase Wallet, etc.) conforming to **EIP-1193**
- Performs standard Web3 handshakes (`eth_requestAccounts`) and tracks native gas balances (`eth_getBalance`)
- Observes live session changes (`accountsChanged`, `chainChanged`) to handle hot account swaps dynamically
- Built-in on-chain CNDR faucet on Arbitrum Sepolia (10,000 CNDR per wallet per day); a browser-only demo balance is used when no token is configured

### 🔒 Navigation Gating & Session Redirects
- Restricts dApp routes `/dashboard` and `/portfolio` to connected wallet sessions only
- Automatically intercepts disconnected users using Next.js `useRouter` redirects and pushes them back to `/`
- Render-gated home page feed showing a compact, blurred teaser story card with backdrop-filter blur and exact border alignment if disconnected

### 🔔 Alert System
- Telegram bot for real-time narrative shift alerts and trade notifications
- Configurable alert thresholds (notify at 60°, trade at 80°)
- Daily Telegram digest with performance summary

---

## Architecture

> For detailed technical architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        CINDER SYSTEM                         │
│                                                                 │
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   │
│  │  DATA LAYER  │──▶│  BRAIN LAYER  │──▶│  OUTPUT LAYER    │   │
│  │              │   │               │   │                  │   │
│  │ • SoSoValue  │   │ • Wire Gen    │   │ • News Website   │   │
│  │   ETF API    │   │ • Narrative   │   │ • Dashboard      │   │
│  │ • SoSoValue  │   │   Detection   │   │ • Telegram Bot   │   │
│  │   AI News    │   │ • Trade       │   │ • SoDEX Trades   │   │
│  │ • SoSoValue  │   │   Execution   │   │                  │   │
│  │   Sector API │   │               │   │                  │   │
│  └──────────────┘   └───────────────┘   └──────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR for SEO, API routes for backend logic |
| Styling | Vanilla CSS + CSS Variables | Dark theme, obsidian clay-glass layout, no framework overhead |
| Web3 Wallet | EIP-1193 / window.ethereum RPC | Connection to real wallets (MetaMask, Rabby) and fetching native balances |
| Charts | Recharts + D3.js | Recharts for story charts, D3 for narrative bubble map |
| Animation | Framer Motion | Smooth narrative transitions and live updates |
| AI/LLM | OpenAI-compatible API (default model `mimo-v2.5`) | Story generation, news classification and refinement |
| Database | Turso (libSQL) via `@libsql/client` | Hosted SQLite in production, local `local.db` file in development; stores stories, narrative history, trades |
| Real-time | Server-Sent Events (SSE) | Live story updates on the news feed |
| Testing | Vitest + Hardhat | App tests with database, LLM and chain mocks; contract tests on a local Hardhat chain |
| Trading | SoDEX REST API | Order placement, cancellation, account management |
| Data | SoSoValue REST API | ETF flows, AI news feed, sector/index data |
| Alerts | Telegram Bot API | Narrative shift + trade notifications |
| Token | Solidity + Hardhat | CNDR testnet settlement token with daily faucet (`contracts/`) |

---

## API Integration

> For detailed API integration guide, see [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md)

### SoSoValue API (Data & Intelligence)

Cinder uses **three** SoSoValue API endpoint categories:

| Endpoint Category | Used For | Update Frequency |
|---|---|---|
| ETF Flow Data | Daily inflows/outflows for BTC, ETH, SOL ETFs | Every 4 hours |
| AI News Feed | Real-time AI-summarized crypto news | Continuous (streaming) |
| Sector/Index Data | SSI protocol index performance + composition | Every 4 hours |

### SoDEX API (Execution)

Cinder uses **four** SoDEX API capabilities:

| Capability | Used For | Auth Required |
|---|---|---|
| Market Data (REST) | Asset pricing for portfolio valuation | No |
| Order Placement (REST) | Executing narrative-driven trades | Yes (EIP-712) |
| Order Cancellation (REST) | Stop-loss management | Yes (EIP-712) |
| Account State (REST) | Portfolio balances and positions | Yes (EIP-712) |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 (CI uses Node 20)
- **SoSoValue API Key**: [register here](https://sosovalue.com), then apply via the [Buildathon form](https://forms.gle/2nuJT2qNbUQsyyZy8)
- **An OpenAI-compatible LLM endpoint and key**: OpenAI or any provider exposing the same API (default model: `mimo-v2.5`)
- **SoDEX account + API key** (optional): [register here](https://sodex.com); testnet is available without a rank requirement. Without it, Cinder runs in demo mode with simulated fills.
- **Turso database** for production. Local development falls back to a `local.db` SQLite file.

### Installation

```bash
git clone https://github.com/Turnless/Cinder.git
cd Cinder
npm install
cp .env.example .env   # then fill in your keys
```

### Environment Variables

`.env.example` lists every variable with comments. The main ones:

| Variable | Needed for | Purpose |
|---|---|---|
| `SOSOVALUE_API_KEY` | Always | ETF flows, AI news feed, sector data |
| `OPENAI_API_KEY` | Always | Story generation, news classification and refinement |
| `OPENAI_BASE_URL`, `OPENAI_MODEL` | Optional | Use any OpenAI-compatible provider and model (defaults: OpenAI URL, `mimo-v2.5`) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Production | libSQL database; the app refuses to start in production without it |
| `INTERNAL_API_SECRET` | Always | Protects `POST /api/stories`, `POST /api/narrative` and trusted calls to `POST /api/trade` |
| `SODEX_API_KEY_NAME`, `SODEX_API_KEY_PRIVATE_KEY`, `USER_WALLET_ADDRESS`, `SODEX_API_BASE_URL` | Live trading | Signed SoDEX orders. Without them, trades are simulated. |
| `SODEX_MASTER_PRIVATE_KEY` | Setup only | Registering the SoDEX API key (`scripts/register-sodex-api-key.js`) |
| `NEXT_PUBLIC_CNDR_TOKEN_ADDRESS` | CNDR settlement | CNDR token on Arbitrum Sepolia. Without it, balances are browser-only demo balances. |
| `TREASURY_PRIVATE_KEY` | Recommended | Wallet that receives CNDR for buys and pays CNDR out for sells (falls back to `USER_WALLET_ADDRESS` and the SoDEX key) |
| `ARBITRUM_SEPOLIA_RPC_URL` (or `RPC_URL`) | Optional | Server-side RPC; defaults to the public Arbitrum Sepolia RPC |
| `CHAIN_ID` | Optional | Chain used to verify wallet-signed orders (default `421614`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_USERNAME` | Telegram alerts | Bot alerts; `TELEGRAM_CHAT_ID` is the admin chat |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram alerts | Webhook authentication; must match the value used with `scripts/set-telegram-webhook.js` |
| `AUTO_TRADE_ENABLED`, `MAX_ALLOCATION_PER_TRADE`, `STOP_LOSS_PERCENTAGE`, `COOLDOWN_HOURS`, `QTY_DECIMALS` | Optional | Risk settings. Auto-trading is off unless `AUTO_TRADE_ENABLED=true`. |
| `EDGE_CONFIG`, `KILL_SWITCH_FAIL_CLOSED` | Optional | Vercel Edge Config kill switch (`trading_paused`); pauses trading if Edge Config can't be read |
| `NEWS_TTL_HOURS`, `ETF_FLOWS_TTL_HOURS` | Optional | Data retention for cached news and ETF flows |

### Running Locally

```bash
npm run dev
```

The app runs at http://localhost:3000. In development, the first request to `/api/stories` also starts the background scheduler in the same process: the hourly news and narrative cycle (including shift detection and trading), Market Pulse every 4 hours, the daily Deep Dive, stop-loss checks every 5 minutes and nightly data pruning.

To run the scheduler on its own (Node 22+):

```bash
npm run worker
```

> **Production note:** Vercel doesn't keep a process running, so the scheduler doesn't run there. The live site serves stories already in the database and refreshes the news feed when people visit (at most every 5 minutes). Autonomous publishing and trading need the worker running on an always-on host: see **[docs/WORKER.md](docs/WORKER.md)** for setup, safe start-up and pausing.

### Testnet & Live Trading

Cinder targets **SoDEX testnet** (`SODEX_API_BASE_URL=https://testnet-gw.sodex.dev/api/v1/spot`). Auto-trading stays off unless `AUTO_TRADE_ENABLED=true`, and every automated trade still has to pass the risk gates: cooldown, max open positions, daily loss limit, kill switch, and a guard that blocks mainnet URLs outside production.

### CNDR Token (`contracts/`)

CNDR is a testnet ERC-20 on **Arbitrum Sepolia** at `0x6C64923FD6478D265A1b5a971c6bC59cB35A5FA7`. Each wallet can claim **10,000 CNDR per day** from its faucet (a normal transaction, so it needs a little Arbitrum Sepolia ETH). QuickTrade buys are paid in CNDR to the treasury, and sells are paid out from it.

The contract has its own Hardhat project, separate from the app's dependencies:

```bash
cd contracts
npm install
npm test
```

Deploying a **new** copy resets every balance, so only do it deliberately:

```bash
cd contracts
npx hardhat vars set DEPLOYER_PRIVATE_KEY
npm run deploy:arbitrum-sepolia
```

Then set `NEXT_PUBLIC_CNDR_TOKEN_ADDRESS` to the new address and redeploy the app.

### 🧪 Tests & CI

```bash
npm test                    # app tests (Vitest); database, LLM, SoDEX and chain calls are mocked
npm run lint
cd contracts && npm test    # contract tests (Hardhat)
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, the app tests, a production build and the contract tests on every pull request to `main`.

---

## Project Structure

```
cinder/
├── README.md
├── .env.example
├── .github/workflows/ci.yml          # Lint, tests, build, contract tests
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API_INTEGRATION.md
│   └── WORKER.md                     # Running the scheduler on an always-on host
├── contracts/                        # Hardhat project (own package.json)
│   ├── src/CinderToken.sol           # CNDR testnet token + faucet
│   ├── test/CinderToken.js
│   ├── scripts/deploy.js
│   └── hardhat.config.js
├── migrations/
│   ├── 0001_init.sql
│   ├── 0002_add_user_address.sql
│   ├── 0003_trade_replay_protection.sql
│   └── 0004_app_settings.sql         # Shared trading_paused flag
├── scripts/
│   ├── worker.js                     # Scheduler for an always-on host (npm run worker)
│   ├── db-init.js
│   ├── register-sodex-api-key.js
│   ├── set-telegram-webhook.js
│   ├── seed-more-stories.js
│   └── test-*.js / test-*.mjs        # Manual end-to-end checks
└── src/
    ├── app/
    │   ├── page.js, layout.js
    │   ├── feed/, story/[id]/, dashboard/, portfolio/
    │   └── api/
    │       ├── stories/              # GET feed (+ throttled refresh), POST requires internal secret
    │       ├── stories/stream/       # Server-Sent Events
    │       ├── narrative/            # GET temperatures, POST requires internal secret
    │       ├── trade/                # GET portfolio/prices, POST wallet-signed or internal trades
    │       ├── telegram-auth/        # Wallet-signed Telegram linking
    │       ├── webhook/              # Telegram webhook (secret required)
    │       └── market-update/
    ├── components/
    │   ├── wire/                     # StoryCard (escaped markdown), StoryFeed, charts
    │   ├── narrative/                # BubbleMap, Timeline, TemperatureGauge, ShiftAlert
    │   ├── trading/                  # PortfolioView, QuickTrade, TradeHistory, RiskDashboard
    │   └── shared/
    ├── context/WalletContext.js      # Wallet connection, network switching, faucet
    ├── engine/
    │   ├── narrative.js              # Narrative temperatures
    │   ├── shift-detector.js         # Regime shift detection
    │   └── trade-engine.js           # Risk gates, sizing, execution, stop-losses
    ├── lib/
    │   ├── sosovalue.js, sodex.js, openai.js, telegram.js
    │   ├── cndr.js                   # Treasury, CNDR payment verification, payouts
    │   ├── secrets.js                # Constant-time secret checks
    │   ├── validator.js              # Fact-checks AI stories against the database
    │   ├── db.js, scheduler.js, rate-limiter.js, telegram-link.js
    └── styles/
```

### Security Hardening

Fixes applied during the post-hackathon review.

#### Trusted vs. wallet-signed requests
`POST /api/stories` and `POST /api/narrative` require an `x-internal-api-secret` header matching `INTERNAL_API_SECRET`. `POST /api/trade` accepts either that header (trusted callers) or an EIP-712 order signature from the trading wallet. Secrets are compared in constant time.

#### Wallet-signed trades
- **Replay protection:** the nonce is the signing time; orders signed more than 5 minutes ago, or submitted twice, are rejected.
- **Server-side pricing:** fills and payouts use the server's SoDEX price, never the price in the request. Live mode refuses to trade on fallback prices.
- **Sells:** the wallet must hold the position it's selling.
- **Buys:** when CNDR is deployed, the on-chain CNDR payment to the treasury is verified, and each payment can only be used once.
- **No fake fills:** if a live SoDEX order fails, the trade is recorded and shown as *simulated*, not filled.

#### Telegram
Linking Telegram requires a wallet signature, link tokens expire after 15 minutes, and the webhook only accepts requests carrying `TELEGRAM_WEBHOOK_SECRET`.

#### Pausing
The admin's Telegram `/pause` is stored in the database (`app_settings.trading_paused`), so it stops both autonomous trades and stop-loss sells in the worker process, not just in the server that received the message.

#### Kill-Switch Fail-Closed
If the Edge Config lookup fails (network error, timeout, misconfigured client), the kill-switch **fails closed** (trades paused). Set `KILL_SWITCH_FAIL_CLOSED=false` to revert to failing open. Stop-loss monitoring also respects the kill switch.

#### Nonce Generation
The SoDEX order nonce is a monotonic counter (not `Date.now()`), preventing nonce reuse under concurrent requests that could cause duplicate fills.

#### Database Guard
When `TURSO_DATABASE_URL` is unset in a production environment, the app fails immediately at startup rather than silently connecting to an in-memory database.

#### XSS Protection
Story card markdown output is escaped via `escapeHtml()` before rendering, preventing injection via crafted story text.

#### Risk gates
The daily-loss circuit breaker also trips when `portfolioValue <= 0`; the cooldown checks the most recent buy; the open-position limit counts only positions that are still open.

#### Cost control
Every feed visit asks for a news refresh; the SoSoValue fetch and AI refinement run at most once every 5 minutes per server instance.

---

## Demo

### Live Demo
🌐 **[https://cinderhq.vercel.app](https://cinderhq.vercel.app)** *(deployed during buildathon)*

### Demo Video
🎥 **[Watch the 2-minute walkthrough →](#)** *(link to be added)*

### Demo Script

1. **Open the Wire** → See live stories publishing with ETF flow data, sector analysis, and AI commentary
2. **Check the Narrative Dashboard** → Watch the bubble map showing "Institutional Accumulation" cooling and "AI Token Rotation" heating
3. **See a Shift Alert** → When confidence crosses 80%, a breaking story auto-publishes with the trade plan
4. **View the Trade** → Portfolio page shows the executed SoDEX trade, linked to the story that triggered it
5. **Read the Transparency** → Every trade has an article. Every article has data. Full audit trail.

---

## Buildathon Criteria Coverage

| Criterion | How Cinder Addresses It | Status |
|---|---|---|
| ✅ Genuine SoSoValue API integration | Uses ETF flows, AI news feed, and sector/index data as the sole data source for all intelligence | **Core** |
| ✅ Clear use case | Autonomous financial wire service + narrative-driven portfolio management | **Core** |
| ✅ Complete data → output flow | SoSoValue data → AI story + narrative detection → trade execution on SoDEX | **Core** |
| ⭐ SoDEX API integration | Auto-executes trades, manages positions, sets stop-losses via SoDEX | **Implemented** |
| ⭐ AI-enhanced functionality | AI generates stories, classifies narratives, detects shifts, and sizes trades | **Implemented** |
| ⭐ Opportunity discovery | Narrative shift detection surfaces opportunities before price catches up | **Implemented** |
| ⭐ Risk control + security | Stop-losses, max allocation caps, cooldowns, multi-signal confirmation, human override | **Implemented** |
| ⭐ Insight-to-action flow | Published story → embedded trade recommendation → one-click SoDEX execution | **Implemented** |
| ⭐ Product experience | Professional news site + interactive dashboard + Telegram alerts | **Implemented** |

---

## Contributing

This project was built for the **SoSoValue × SoDEX Buildathon (Wave 3, July 2026)**.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built with ⚡ by turnless for the SoSoValue × SoDEX Buildathon</strong><br/>
  <em>"What if Bloomberg could trade its own stories?"</em>
</p>
