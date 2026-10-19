import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/db.js', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

vi.mock('../../../../lib/sosovalue.js', () => ({
  getAINewsFeed: vi.fn()
}));

vi.mock('../../../../lib/openai.js', () => ({
  refineAllNews: vi.fn()
}));

vi.mock('../../../../lib/rate-limiter.js', () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true })
}));

import { query, execute } from '../../../../lib/db.js';
import { getAINewsFeed } from '../../../../lib/sosovalue.js';

const refreshRequest = () => new Request('http://localhost/api/stories?refresh=true&limit=5');

describe('GET /api/stories?refresh=true', () => {
  let GET;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules(); // fresh throttle state per test
    ({ GET } = await import('../route.js'));
    query.mockImplementation(async (sql) =>
      sql.includes('sqlite_master')
        ? ['stories', 'news_items', 'etf_flows', 'sector_data', 'narrative_history'].map(name => ({ name }))
        : []
    );
    execute.mockResolvedValue({ rowsAffected: 1 });
    getAINewsFeed.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes news on the first request', async () => {
    const res = await GET(refreshRequest());
    expect(res.status).toBe(200);
    expect(getAINewsFeed).toHaveBeenCalledOnce();
  });

  it('skips the refresh for repeat visits within 5 minutes, still returning stories', async () => {
    await GET(refreshRequest());
    const res = await GET(refreshRequest());
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(getAINewsFeed).toHaveBeenCalledOnce();
  });

  it('refreshes again once 5 minutes have passed', async () => {
    await GET(refreshRequest());
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await GET(refreshRequest());

    expect(getAINewsFeed).toHaveBeenCalledTimes(2);
  });
});
