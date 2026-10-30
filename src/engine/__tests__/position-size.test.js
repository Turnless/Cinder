import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculatePositionSize } from '../trade-engine.js';

// Mock DB and external services to isolate tests and avoid network calls
vi.mock('../../lib/db.js', () => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../../lib/sodex.js', () => ({
  placeOrder: vi.fn(),
  getTicker: vi.fn(),
  fetchAccountBalances: vi.fn(),
  getAccountState: vi.fn(),
  getSymbolForPair: vi.fn().mockResolvedValue({ name: 'vBTC_vUSDC' }),
}));

vi.mock('../../lib/openai.js', () => ({
  createBreakingStory: vi.fn(),
}));

describe('calculatePositionSize', () => {
  beforeEach(() => {
    process.env.MAX_ALLOCATION_PER_TRADE = '0.30';
  });

  it('calculates correct sizing within budget', () => {
    const size = calculatePositionSize(10000, 5000); // 30% of 10000 is 3000, capped by 5000 -> 3000
    expect(size).toBe(3000);
  });

  it('caps sizing at available balance if less than target', () => {
    const size = calculatePositionSize(10000, 1000); // 30% of 10000 is 3000, capped by 1000 -> 1000
    expect(size).toBe(1000);
  });
});
