import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/db.js', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

vi.mock('../../../../lib/sosovalue.js', () => ({
  getAINewsFeed: vi.fn().mockResolvedValue([])
}));

vi.mock('../../../../lib/openai.js', () => ({
  refineAllNews: vi.fn()
}));

vi.mock('../../../../lib/rate-limiter.js', () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true })
}));

import { query } from '../../../../lib/db.js';
import { GET } from '../route.js';

const STORIES = [
  { id: 's1', type: 'breaking', title: 'Shift', body: 'b', summary: 's', published_at: '2026-10-22T07:00:00Z' },
  { id: 's2', type: 'pulse', title: 'Pulse', body: 'b', summary: 's', published_at: '2026-10-22T06:00:00Z' }
];
const NEWS = [{ id: 'n1', title: 'News', summary: 'x', source: 'PANews', keywords: '[]', sentiment: 0.2, fetched_at: '2026-10-22T07:30:00Z' }];

describe('GET /api/stories?type=', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockImplementation(async (sql) => {
      if (sql.includes('sqlite_master')) {
        return ['stories', 'news_items', 'etf_flows', 'sector_data', 'narrative_history'].map(name => ({ name }));
      }
      if (sql.includes('FROM stories')) return STORIES;
      if (sql.includes('FROM news_items')) return NEWS;
      return [];
    });
  });

  const get = (type) => GET(new Request(`http://localhost/api/stories?limit=10${type ? `&type=${type}` : ''}`));

  it('cinder returns all of Cinder\'s own stories and no news', async () => {
    const data = await (await get('cinder')).json();

    expect(data.stories.map(s => s.id)).toEqual(['s1', 's2']);
    const storiesSql = query.mock.calls.map(([sql]) => sql).find(sql => sql.includes('FROM stories'));
    expect(storiesSql).not.toContain('WHERE type');
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM news_items'))).toBe(false);
  });

  it('a single type filters the stories table', async () => {
    await get('breaking');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE type = ?'), ['breaking']);
  });

  it('no type mixes stories and news, newest first', async () => {
    const data = await (await get()).json();

    expect(data.stories.map(s => s.id)).toEqual(['n1', 's1', 's2']);
  });
});
