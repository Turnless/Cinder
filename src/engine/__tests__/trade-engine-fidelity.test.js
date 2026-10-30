import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkMarketAndTrade } from '../trade-engine.js';
import { execute, query, batch } from '../../lib/db.js';
import { createBreakingStory } from '../../lib/openai.js';
import { updateNarrativeTemperatures, NARRATIVES } from '../narrative.js';
import { detectShift } from '../shift-detector.js';

// Mock DB
vi.mock('../../lib/db.js', () => ({
  query: vi.fn(),
  execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  batch: vi.fn()
}));

// Mock OpenAI
vi.mock('../../lib/openai.js', () => ({
  createBreakingStory: vi.fn(),
  refineAllNews: vi.fn(n => n)
}));

// Mock shift-detector and narrative
vi.mock('../shift-detector.js', () => ({
  detectShift: vi.fn()
}));
vi.mock('../narrative.js', () => {
  const original = vi.importActual('../narrative.js');
  return {
    ...original,
    updateNarrativeTemperatures: vi.fn(),
    NARRATIVES: {
      'NAR_01': { name: 'Institutional Accumulation' },
      'NAR_02': { name: 'Retail FOMO' }
    }
  };
});

// Mock SoDEX
vi.mock('../../lib/sodex.js', () => ({
  getAccountState: vi.fn().mockResolvedValue({
    balances: [{ asset: 'USDC', free: '1000.00' }]
  }),
  getTicker: vi.fn().mockResolvedValue({ price: '60000.00' }),
  placeOrder: vi.fn().mockResolvedValue({ status: 'FILLED', orderId: 'sodex-order-123', price: '60000.00' }),
  fetchAccountBalances: vi.fn().mockResolvedValue([{ asset: 'USDC', free: '1000.00' }]),
  getSymbolForPair: vi.fn().mockResolvedValue({ name: 'vBTC_vUSDC' })
}));

describe('Story Data Fidelity Validator Integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USER_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
    process.env.AUTO_TRADE_ENABLED = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('triggers the template fallback path when LLM story contains mismatched inflow numbers', async () => {
    // 1. Setup mock database state
    // First query is in detectShift for oldestRecord (min time), return some date
    // Then the validator queries etf_flows and sector_data
    query.mockImplementation(async (sql, params) => {
      if (sql.includes('MIN(recorded_at)')) {
        return [{ earliest: new Date(Date.now() - 100 * 3600000).toISOString() }];
      }
      if (sql.includes('etf_flows')) {
        // Actual BTC net flow is $250.0M (250,000,000)
        return [{ net_flow: 250000000, asset: 'BTC' }];
      }
      if (sql.includes('sector_data')) {
        return [{ sector: 'AI Sector Index', performance_7d: 0.1125, performance_30d: 0.2450 }];
      }
      return [];
    });

    // 2. Setup mock shift detection: shift from NAR_01 to NAR_02
    detectShift.mockResolvedValue({
      from_narrative: 'NAR_01',
      to_narrative: 'NAR_02',
      confidence: 85,
      signals: JSON.stringify(['Dominant cooled', 'Emerging heated']),
      detected_at: new Date().toISOString()
    });

    // 3. Setup LLM to output a story with a mismatched inflow number: cites $999M BTC inflow
    createBreakingStory.mockResolvedValue(
      `# Institutional Shift to Retail FOMO\n\n` +
      `The market narrative has transformed. Bitcoin saw a massive $999M inflow in ETFs.\n\n` +
      `| Metric | Value |\n|---|---|\n| Confidence | 85% |`
    );

    // 4. Run hourly evaluation cycle
    await checkMarketAndTrade();

    // 5. Verify database batch statements
    const batchCalls = batch.mock.calls;
    const storyBatchCall = batchCalls.find(call =>
      call[0].some(stmt => stmt.sql.includes('INSERT INTO stories'))
    );
    expect(storyBatchCall).toBeDefined();

    const storyStmt = storyBatchCall[0].find(stmt => stmt.sql.includes('INSERT INTO stories'));
    const storyBodyArg = storyStmt.args[3]; // index 3 is storyBody parameter
    expect(storyBodyArg).toContain('This template story has been generated automatically to preserve data fidelity');
    expect(storyBodyArg).not.toContain('Bitcoin saw a massive $999M inflow');
    console.log('✅ Fallback template story triggered successfully on mismatched numbers.');
  });
});
