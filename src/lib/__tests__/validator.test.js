import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn()
}));

import { query } from '../db.js';
import { validateStory } from '../validator.js';

describe('validateStory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STOP_LOSS_PERCENTAGE;
    delete process.env.MAX_ALLOCATION_PER_TRADE;
    delete process.env.NARRATIVE_TRADE_THRESHOLD;
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM etf_flows')) return [{ net_flow: 250_000_000, asset: 'BTC' }];
      if (sql.includes('FROM sector_data')) return [{ performance_7d: 0.1125, performance_30d: null, sector: 'AI' }];
      return [];
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('accepts flows and sector moves that match the database', async () => {
    expect(await validateStory('BTC ETFs took in $250M while the AI sector gained 11.25%.')).toBe(true);
  });

  it('rejects a flow figure that is not in the database', async () => {
    expect(await validateStory('BTC ETFs took in $900M this week.')).toBe(false);
  });

  it('rejects a percentage that is not in the database', async () => {
    expect(await validateStory('The AI sector gained 37%.')).toBe(false);
  });

  it('does not mistake minutes or months for million-dollar flows', async () => {
    expect(await validateStory('The order filled within 30 minutes, the first rotation in 3 months.')).toBe(true);
  });

  it("accepts the engine's own risk parameters", async () => {
    const story = 'Position capped at 30% of the portfolio with an 8% trailing stop and a 15% daily loss limit.';
    expect(await validateStory(story)).toBe(true);
  });

  it('follows risk parameters configured through the environment', async () => {
    process.env.STOP_LOSS_PERCENTAGE = '0.05';
    expect(await validateStory('A 5% trailing stop protects the entry.')).toBe(true);
  });

  it('skips confidence figures written before or after the word', async () => {
    expect(await validateStory('Shift confidence: 92%.')).toBe(true);
    expect(await validateStory('The shift was detected with 92% confidence.')).toBe(true);
  });

  it('fails closed when the database cannot be read', async () => {
    query.mockRejectedValue(new Error('db offline'));
    expect(await validateStory('Anything')).toBe(false);
  });
});
