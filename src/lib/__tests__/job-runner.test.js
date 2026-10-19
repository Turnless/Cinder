import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJobTracker } from '../job-runner.js';

// A job whose completion the test controls
function deferredJob() {
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  return { fn: vi.fn(() => done), finish };
}

describe('createJobTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = createJobTracker();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('skips a run while the previous run of the same job is still going', async () => {
    const job = deferredJob();
    const first = tracker.runExclusive('stopLoss', job.fn);
    const second = await tracker.runExclusive('stopLoss', job.fn);

    expect(second).toBe(false);
    expect(job.fn).toHaveBeenCalledTimes(1);
    expect(tracker.getStatus().stopLoss).toMatchObject({ running: true, runs: 1, skipped: 1 });

    job.finish();
    expect(await first).toBe(true);
    expect(tracker.getStatus().stopLoss.running).toBe(false);
  });

  it('lets different jobs run at the same time', async () => {
    const a = deferredJob();
    const b = deferredJob();
    tracker.runExclusive('a', a.fn);
    tracker.runExclusive('b', b.fn);

    expect(tracker.runningJobs().sort()).toEqual(['a', 'b']);
    a.finish();
    b.finish();
  });

  it('runs again once the previous run has finished', async () => {
    const fn = vi.fn().mockResolvedValue();
    await tracker.runExclusive('pulse', fn);
    await tracker.runExclusive('pulse', fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(tracker.getStatus().pulse.runs).toBe(2);
  });

  it('records a failure without throwing, and clears it after a good run', async () => {
    const ran = await tracker.runExclusive('pulse', () => Promise.reject(new Error('LLM timeout')));
    expect(ran).toBe(true);
    expect(tracker.getStatus().pulse).toMatchObject({ running: false, lastError: 'LLM timeout' });

    await tracker.runExclusive('pulse', () => Promise.resolve());
    expect(tracker.getStatus().pulse.lastError).toBeNull();
  });

  it('waitForIdle resolves once running jobs finish', async () => {
    const job = deferredJob();
    tracker.runExclusive('trade', job.fn);

    const idle = tracker.waitForIdle(1000, 5);
    setTimeout(job.finish, 20);
    expect(await idle).toBe(true);
  });

  it('waitForIdle gives up after the timeout', async () => {
    const job = deferredJob();
    tracker.runExclusive('trade', job.fn);

    expect(await tracker.waitForIdle(30, 5)).toBe(false);
    job.finish();
  });
});
