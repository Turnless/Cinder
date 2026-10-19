// Cinder Background Scheduler Worker Daemon
//
// Runs the scheduler (news/narrative cycle, stories, trading, stop-losses, pruning) as a
// long-lived process for an always-on host. See docs/WORKER.md for setup.
//
// Optional environment:
//   PORT                     serve GET /health (job status) on this port
//   WORKER_SHUTDOWN_GRACE_MS how long to let a running job finish on shutdown (default 60000)
import fs from 'fs';
import http from 'http';
import path from 'path';

// 1. Load .env for local runs. Values already set by the host win, so a stray .env can't override them.
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const firstEquals = trimmed.indexOf('=');
        if (firstEquals !== -1) {
          const key = trimmed.slice(0, firstEquals).trim();
          let value = trimmed.slice(firstEquals + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (e) {
  // Ignore loader error
}

// 2. With a remote database configured, run as production: db.js then refuses to silently
//    fall back to a local SQLite file if Turso is briefly unreachable.
if (!process.env.NODE_ENV && process.env.TURSO_DATABASE_URL) {
  process.env.NODE_ENV = 'production';
}

process.on('unhandledRejection', (reason) => {
  console.error('[WORKER] Unhandled promise rejection (worker keeps running):', reason);
});

// 3. Import only after the environment is ready: these modules read it when they load
const { initializeDb } = await import('../src/lib/db.js');
await initializeDb();
const { jobTracker, stopAllJobs } = await import('../src/lib/scheduler.js');

const startedAt = new Date().toISOString();
console.log('[INFO] Cinder Background Scheduler Worker Active.');

// 4. Optional health endpoint for hosts and uptime monitors
let server = null;
const port = Number(process.env.PORT);
if (port > 0) {
  server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', startedAt, jobs: jobTracker.getStatus() }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  server.listen(port, () => console.log(`[INFO] Worker health endpoint listening on :${port}/health`));
}

// 5. Graceful shutdown: hosts send SIGTERM on redeploy; don't cut a trade or stop-loss off midway
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[WORKER] ${signal} received: stopping schedules...`);
  stopAllJobs();

  const graceMs = Number(process.env.WORKER_SHUTDOWN_GRACE_MS) || 60000;
  const running = jobTracker.runningJobs();
  if (running.length > 0) {
    console.log(`[WORKER] Waiting up to ${graceMs / 1000}s for running jobs: ${running.join(', ')}`);
  }
  const finished = await jobTracker.waitForIdle(graceMs);
  if (!finished) {
    console.warn(`[WORKER] Still running after grace period, exiting anyway: ${jobTracker.runningJobs().join(', ')}`);
  }

  if (server) server.close();
  console.log('[WORKER] Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
