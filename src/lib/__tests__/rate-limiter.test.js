import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('rateLimit', () => {
  let rateLimit;
  let trackedIpCount;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules(); // fresh in-memory cache per test
    ({ rateLimit, trackedIpCount } = await import('../rate-limiter.js'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit, then blocks until the window passes', () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('1.1.1.1', 3).success).toBe(true);
    }
    expect(rateLimit('1.1.1.1', 3).success).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(rateLimit('1.1.1.1', 3).success).toBe(true);
  });

  it('limits each IP separately', () => {
    expect(rateLimit('1.1.1.1', 1).success).toBe(true);
    expect(rateLimit('1.1.1.1', 1).success).toBe(false);
    expect(rateLimit('2.2.2.2', 1).success).toBe(true);
  });

  it('forgets IPs that have been idle for a full window', () => {
    rateLimit('1.1.1.1');
    rateLimit('2.2.2.2');
    expect(trackedIpCount()).toBe(2);

    vi.advanceTimersByTime(60_001);
    rateLimit('3.3.3.3');
    expect(trackedIpCount()).toBe(1);
  });
});
