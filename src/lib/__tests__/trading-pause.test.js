import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

import { query, execute } from '../db.js';
import { setTradingPaused, isTradingPausedInDb } from '../trading-pause.js';

describe('trading pause flag', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('stores the pause as an upsert of trading_paused', async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });

    await setTradingPaused(true);
    await setTradingPaused(false);

    expect(execute.mock.calls[0][0]).toContain('INSERT INTO app_settings');
    expect(execute.mock.calls[0][0]).toContain('ON CONFLICT(key) DO UPDATE');
    expect(execute.mock.calls[0][1]).toEqual(['true']);
    expect(execute.mock.calls[1][1]).toEqual(['false']);
  });

  it('reads paused only when the stored value is "true"', async () => {
    query.mockResolvedValueOnce([{ value: 'true' }]);
    expect(await isTradingPausedInDb()).toBe(true);

    query.mockResolvedValueOnce([{ value: 'false' }]);
    expect(await isTradingPausedInDb()).toBe(false);

    query.mockResolvedValueOnce([]);
    expect(await isTradingPausedInDb()).toBe(false);
  });

  it('treats a database error as not paused (Edge Config is the fail-closed switch)', async () => {
    query.mockRejectedValueOnce(new Error('no such table: app_settings'));
    expect(await isTradingPausedInDb()).toBe(false);
  });

  it('lets a failed save surface to the caller', async () => {
    execute.mockRejectedValueOnce(new Error('db offline'));
    await expect(setTradingPaused(true)).rejects.toThrow('db offline');
  });
});
