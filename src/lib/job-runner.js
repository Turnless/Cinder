/**
 * Tracks scheduled jobs so they never overlap and their health can be reported.
 * A run that is still going when the next tick fires is skipped, not doubled up:
 * two overlapping stop-loss runs could otherwise sell the same position twice.
 */
export function createJobTracker() {
  const jobs = new Map();

  function entry(name) {
    if (!jobs.has(name)) {
      jobs.set(name, {
        running: false,
        runs: 0,
        skipped: 0,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastDurationMs: null,
        lastError: null
      });
    }
    return jobs.get(name);
  }

  /**
   * Runs `fn` unless a previous run of the same job is still in progress.
   * Errors are recorded and logged, never thrown, so one failing job can't stop the scheduler.
   * @param {string} name - Job name
   * @param {Function} fn - Async job body
   * @returns {Promise<boolean>} True if the job ran, false if it was skipped
   */
  async function runExclusive(name, fn) {
    const job = entry(name);
    if (job.running) {
      job.skipped += 1;
      console.warn(`[SCHEDULER] Skipping ${name}: previous run still in progress (started ${job.lastStartedAt}).`);
      return false;
    }

    job.running = true;
    job.runs += 1;
    const started = Date.now();
    job.lastStartedAt = new Date(started).toISOString();
    try {
      await fn();
      job.lastError = null;
    } catch (err) {
      job.lastError = err?.message || String(err);
      console.error(`[ERROR] Job ${name} failed:`, err);
    } finally {
      job.running = false;
      job.lastFinishedAt = new Date().toISOString();
      job.lastDurationMs = Date.now() - started;
    }
    return true;
  }

  /**
   * @returns {Object} Snapshot of every job's status, keyed by name
   */
  function getStatus() {
    return Object.fromEntries([...jobs].map(([name, job]) => [name, { ...job }]));
  }

  /**
   * @returns {string[]} Names of jobs currently running
   */
  function runningJobs() {
    return [...jobs].filter(([, job]) => job.running).map(([name]) => name);
  }

  /**
   * Waits until no job is running (used on shutdown so a trade isn't cut off midway).
   * @param {number} timeoutMs - Give up after this long
   * @param {number} [pollMs=250] - Check interval
   * @returns {Promise<boolean>} True if everything finished in time
   */
  async function waitForIdle(timeoutMs, pollMs = 250) {
    const deadline = Date.now() + timeoutMs;
    while (runningJobs().length > 0) {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    return true;
  }

  return { runExclusive, getStatus, runningJobs, waitForIdle };
}
