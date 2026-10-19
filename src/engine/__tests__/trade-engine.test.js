import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock DB module
vi.mock('../../lib/db.js', () => ({
  query: vi.fn(),
  execute: vi.fn(),
  batch: vi.fn()
}));

// 2. Mock OpenAI module
vi.mock('../../lib/openai.js', () => ({
  createBreakingStory: vi.fn().mockResolvedValue('Mocked Breaking Story LLM Content')
}));

// 3. Mock Narrative module
vi.mock('../narrative.js', () => ({
  NARRATIVES: {
    'NAR_01': { id: 'NAR_01', name: 'Institutional Accumulation' },
    'NAR_02': { id: 'NAR_02', name: 'Retail FOMO' },
    'NAR_03': { id: 'NAR_03', name: 'Regulatory Storm' },
    'NAR_04': { id: 'NAR_04', name: 'AI/Tech Rotation' },
    'NAR_05': { id: 'NAR_05', name: 'DeFi Renaissance' },
    'NAR_06': { id: 'NAR_06', name: 'Risk-Off Flight' },
    'NAR_07': { id: 'NAR_07', name: 'L2/Infra Cycle' },
    'NAR_08': { id: 'NAR_08', name: 'Black Swan' }
  },
  updateNarrativeTemperatures: vi.fn().mockResolvedValue({ 'NAR_01': 45.0, 'NAR_02': 75.0 })
}));

// 4. Mock Shift Detector module
vi.mock('../shift-detector.js', () => ({
  detectShift: vi.fn()
}));

// 5. Mock SoDEX module
vi.mock('../../lib/sodex.js', () => ({
  placeOrder: vi.fn(),
  getTicker: vi.fn(),
  fetchAccountBalances: vi.fn(),
  getAccountState: vi.fn()
}));

// 6. Mock Telegram module
vi.mock('../../lib/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(true),
  sendNarrativeAlert: vi.fn().mockResolvedValue(true),
  sendDailyDigest: vi.fn().mockResolvedValue(true)
}));

// 7. Mock the database-backed /pause flag (its own query would otherwise consume the queued db mocks)
vi.mock('../../lib/trading-pause.js', () => ({
  isTradingPausedInDb: vi.fn().mockResolvedValue(false)
}));

// Import modules under test and their mocks
import { query, execute, batch } from '../../lib/db.js';
import { placeOrder, getTicker, fetchAccountBalances, getAccountState } from '../../lib/sodex.js';
import { detectShift } from '../shift-detector.js';
import { createBreakingStory } from '../../lib/openai.js';
import { updateNarrativeTemperatures } from '../narrative.js';
import { isTradingPausedInDb } from '../../lib/trading-pause.js';
import {
  runPreTradeChecks,
  calculatePositionSize,
  checkMarketAndTrade,
  executeStopLossMonitoring,
  sendDailyDigestAlert,
  parseSqliteDatetime
} from '../trade-engine.js';
import { sendMessage, sendNarrativeAlert, sendDailyDigest } from '../../lib/telegram.js';

describe('Cinder Trade Execution Engine', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    global.tradingPaused = undefined;

    // Default clean environment variables for tests
    process.env.AUTO_TRADE_ENABLED = 'true';
    process.env.COOLDOWN_HOURS = '48';
    process.env.USER_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
    process.env.SODEX_API_KEY_PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.SODEX_API_KEY_NAME = 'test-sodex-api-key-name';
    process.env.SODEX_API_BASE_URL = 'https://testnet-gw.sodex.dev/api/v1/spot';
    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'production';

    // Mock db and sodex calls to pass by default
    query.mockResolvedValue([]);
    execute.mockResolvedValue({ rowsAffected: 1, lastInsertRowid: 1 });
    fetchAccountBalances.mockResolvedValue([{ asset: 'USDC', free: '10000.00', locked: '0.00' }]);
    getTicker.mockResolvedValue({ price: '1.00' });
    getAccountState.mockResolvedValue({
      accountId: 'acc-1',
      walletAddress: '0x1234567890123456789012345678901234567890',
      balances: [{ asset: 'USDC', free: '10000.00', locked: '0.00' }]
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('parseSqliteDatetime', () => {
    it("treats SQLite datetime('now') strings as UTC regardless of the server timezone", () => {
      expect(parseSqliteDatetime('2026-01-15 10:30:00')).toBe(Date.UTC(2026, 0, 15, 10, 30, 0));
    });

    it('keeps the zone of ISO strings that carry one', () => {
      expect(parseSqliteDatetime('2026-01-15T10:30:00.000Z')).toBe(Date.UTC(2026, 0, 15, 10, 30, 0));
      expect(parseSqliteDatetime('2026-01-15T11:30:00+01:00')).toBe(Date.UTC(2026, 0, 15, 10, 30, 0));
    });

    it('returns 0 for empty input', () => {
      expect(parseSqliteDatetime(null)).toBe(0);
      expect(parseSqliteDatetime('')).toBe(0);
    });
  });

  describe('runPreTradeChecks (Pre-trade Risk Gates)', () => {
    const defaultShift = {
      from_narrative: 'NAR_01',
      to_narrative: 'NAR_02',
      confidence: 85,
      signals: JSON.stringify(['inflow strong', 'sentiment up'])
    };

    const defaultAccountState = {
      balances: [{ asset: 'USDC', free: '10000.00', locked: '0.00' }]
    };

    // Gate 1: Auto-trade toggles
    describe('Gate 1: Auto-trading Switch', () => {
      it('fails with AUTO_TRADE_DISABLED if process.env.AUTO_TRADE_ENABLED is not true', async () => {
        process.env.AUTO_TRADE_ENABLED = 'false';
        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('AUTO_TRADE_DISABLED');
      });

      it('passes Gate 1 if AUTO_TRADE_ENABLED is true', async () => {
        process.env.AUTO_TRADE_ENABLED = 'true';
        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('AUTO_TRADE_DISABLED');
      });
    });

    // Gate 2: Cooldown hours check
    describe('Gate 2: Cooldown Period Check', () => {
      it('fails with COOLDOWN_ACTIVE if a trade occurred within cooldown period', async () => {
        // Mock query for last trade to return a trade 10 hours ago
        const recentDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
        query.mockImplementation(async (sql) => {
          if (sql.includes('FROM trades')) {
            return [{ created_at: recentDate }];
          }
          return [];
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('COOLDOWN_ACTIVE');
      });

      it('passes if the last trade was outside the cooldown period', async () => {
        // Mock query for last trade to return a trade 50 hours ago (cooldown is 48)
        const oldDate = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
        query.mockImplementation(async (sql) => {
          if (sql.includes('FROM trades')) {
            return [{ created_at: oldDate }];
          }
          return [];
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('COOLDOWN_ACTIVE');
      });

      it('passes if there are no prior trades in the database', async () => {
        query.mockImplementation(async (sql) => {
          if (sql.includes('FROM trades')) {
            return [];
          }
          return [];
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('COOLDOWN_ACTIVE');
      });
    });

    // Gate 3: Max open positions gate
    describe('Gate 3: Max Positions Limit', () => {
      it('fails with MAX_POSITIONS_REACHED if 5 or more positions are open', async () => {
        query.mockImplementation(async (sql) => {
          if (sql.includes("status = 'filled'")) {
            return [{ count: 5 }];
          }
          return [];
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('MAX_POSITIONS_REACHED');
      });

      it('passes if open positions count is less than 5', async () => {
        query.mockImplementation(async (sql) => {
          if (sql.includes("status = 'filled'")) {
            return [{ count: 4 }];
          }
          return [];
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('MAX_POSITIONS_REACHED');
      });

      it('does not let stopped-out trades reduce the open position count', async () => {
        query.mockImplementation(async (sql) => {
          if (sql.includes("status = 'filled'")) return [{ count: 5 }];
          if (sql.includes("status = 'stopped'")) return [{ count: 3 }];
          return [];
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).toContain('MAX_POSITIONS_REACHED');
      });
    });

    // Gate 4: 15% Daily loss circuit breaker
    describe('Gate 4: 15% Daily Loss Circuit Breaker', () => {
      beforeEach(() => {
        process.env.USER_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
        process.env.SODEX_API_KEY_PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      });

      it('fails with DAILY_LOSS_LIMIT_EXCEEDED if realized daily loss exceeds 15% of portfolio value', async () => {
        // Mock portfolio value = $10,000 via fetchAccountBalances and getTicker
        fetchAccountBalances.mockResolvedValue([
          { asset: 'USDC', free: '10000.00', locked: '0.00' }
        ]);

        // Mock recent closed trades to total $2,000 loss
        // E.g. BUY entry at $10.00, stopped/closed at $8.00, qty = 1000. Loss = (8 - 10) * 1000 = -$2000
        query.mockImplementation(async (sql) => {
          if (sql.includes("status = 'stopped' OR status = 'closed'")) {
            return [
              {
                fill_price: '10.00',
                stop_loss_price: '8.00',
                quantity: '1000.00'
              }
            ];
          }
          return [];
        });

        // totalLoss = 2000. portfolioValue = 10000.
        // lossRatio = 2000 / (10000 + 2000) = 2000 / 12000 = 16.67% (> 15%)
        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('DAILY_LOSS_LIMIT_EXCEEDED');
      });

      it('passes daily loss check if realized daily loss is below 15% of portfolio value', async () => {
        fetchAccountBalances.mockResolvedValue([
          { asset: 'USDC', free: '10000.00', locked: '0.00' }
        ]);

        // Mock recent closed trades to total $500 loss
        // BUY entry at $10.00, stopped/closed at $9.50, qty = 1000. Loss = -$500
        query.mockImplementation(async (sql) => {
          if (sql.includes("status = 'stopped' OR status = 'closed'")) {
            return [
              {
                fill_price: '10.00',
                stop_loss_price: '9.50',
                quantity: '1000.00'
              }
            ];
          }
          return [];
        });

        // totalLoss = 500. portfolioValue = 10000.
        // lossRatio = 500 / (10000 + 500) = 500 / 10500 = 4.76% (< 15%)
        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('DAILY_LOSS_LIMIT_EXCEEDED');
      });
    });

    // Gate 5: Edge Config/Global Kill-switch
    describe('Gate 5: Paused State / Kill Switch', () => {
      it('fails with KILL_SWITCH_ACTIVE if /pause was stored in the database (e.g. sent to the website, worker trading)', async () => {
        isTradingPausedInDb.mockResolvedValueOnce(true);
        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('KILL_SWITCH_ACTIVE');
      });

      it('fails with KILL_SWITCH_ACTIVE if global.tradingPaused is true', async () => {
        global.tradingPaused = true;
        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('KILL_SWITCH_ACTIVE');
      });

      it('fails with KILL_SWITCH_ACTIVE if Edge Config endpoint returns true', async () => {
        process.env.EDGE_CONFIG_URL = 'https://edge-config.vercel.com/ecfg-123?sdkToken=token-xyz';
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => true
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('https://edge-config.vercel.com/ecfg-123/value/trading_paused'),
          expect.any(Object)
        );
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('KILL_SWITCH_ACTIVE');
      });

      it('passes if both global.tradingPaused is false/undefined and Edge Config returns false', async () => {
        process.env.EDGE_CONFIG_URL = 'https://edge-config.vercel.com/ecfg-123';
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => false
        });

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('KILL_SWITCH_ACTIVE');
      });
    });

    // Gate 6: Environment safety check
    describe('Gate 6: Environment Safety Separator', () => {
      it('fails with STAGING_ENVIRONMENT_MAINNET_URL_BLOCKED if staging and mainnet base URL are mismatched', async () => {
        process.env.VERCEL_ENV = 'development';
        process.env.SODEX_API_BASE_URL = 'https://mainnet-gw.sodex.dev/api/v1/spot';

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.passed).toBe(false);
        expect(result.failedGates).toContain('STAGING_ENVIRONMENT_MAINNET_URL_BLOCKED');
      });

      it('passes environmental block if mainnet URL is used in production', async () => {
        process.env.VERCEL_ENV = 'production';
        process.env.NODE_ENV = 'production';
        process.env.SODEX_API_BASE_URL = 'https://mainnet-gw.sodex.dev/api/v1/spot';

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('STAGING_ENVIRONMENT_MAINNET_URL_BLOCKED');
      });

      it('passes environmental block if testnet URL is used in staging', async () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.SODEX_API_BASE_URL = 'https://testnet-gw.sodex.dev/api/v1/spot';

        const result = await runPreTradeChecks(defaultShift, defaultAccountState);
        expect(result.failedGates).not.toContain('STAGING_ENVIRONMENT_MAINNET_URL_BLOCKED');
      });
    });
  });

  describe('calculatePositionSize', () => {
    it('allocates correct default percentage (30%) of portfolio value limited by USDC free balance', () => {
      // 30% of $10,000 = $3,000. Balance is $5,000. Sized size = $3,000.
      const size = calculatePositionSize(10000, 5000);
      expect(size).toBe(3000);
    });

    it('limits position size to available USDC balance if allocation exceeds balance', () => {
      // 30% of $10,000 = $3,000. Balance is $1,200. Sized size = $1,200.
      const size = calculatePositionSize(10000, 1200);
      expect(size).toBe(1200);
    });

    it('uses custom MAX_ALLOCATION_PER_TRADE if defined', () => {
      process.env.MAX_ALLOCATION_PER_TRADE = '0.15';
      // 15% of $10,000 = $1,500. Balance is $5,000. Sized size = $1,500.
      const size = calculatePositionSize(10000, 5000);
      expect(size).toBe(1500);
    });
  });

  describe('executeStopLossMonitoring', () => {
    it('skips stop-losses while trading is paused via the database flag', async () => {
      isTradingPausedInDb.mockResolvedValueOnce(true);

      await executeStopLossMonitoring();
      expect(query).not.toHaveBeenCalled(); // never even loads open trades
      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('does nothing if there are no open trades in the database', async () => {
      query.mockResolvedValueOnce([]); // no open trades
      await executeStopLossMonitoring();
      expect(getTicker).not.toHaveBeenCalled();
      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('adjusts/trails stop-loss price upwards if asset price increases', async () => {
      // Open trade entry price $10.00, quantity 100, stop-loss $9.20 (8% below entry)
      const openTrade = {
        id: 't-123',
        pair: 'BTC-USDC',
        quantity: '100',
        fill_price: '10.00',
        stop_loss_price: '9.20',
        status: 'filled'
      };

      query.mockResolvedValueOnce([openTrade]);
      // Current asset price moves up to $11.00
      getTicker.mockResolvedValueOnce({ price: '11.00' });

      // Trailing stop loss (8%) of $11.00 = $10.12.
      // Since $10.12 > $9.20, it should update stop_loss_price to $10.12
      await executeStopLossMonitoring();

      expect(execute).toHaveBeenCalledWith(
        'UPDATE trades SET stop_loss_price = ? WHERE id = ?',
        ['10.1200', 't-123']
      );
      // Price $11.00 is above stop loss $10.12 -> should NOT execute sell order
      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('triggers sell market order and closes trade if price falls below stop-loss price', async () => {
      const openTrade = {
        id: 't-123',
        pair: 'BTC-USDC',
        quantity: '100',
        fill_price: '10.00',
        stop_loss_price: '9.20',
        status: 'filled'
      };

      query.mockResolvedValueOnce([openTrade]);
      // Current asset price drops to $9.10
      getTicker.mockResolvedValueOnce({ price: '9.10' });

      // Trailing stop loss (8%) of $9.10 = $8.372.
      // Since $8.372 < $9.20, stop_loss_price does NOT trail upwards. It stays at $9.20.
      // Since $9.10 <= $9.20, stop loss is triggered!
      await executeStopLossMonitoring();

      expect(placeOrder).toHaveBeenCalledWith({
        pair: 'BTC-USDC',
        side: 'SELL',
        orderType: 'MARKET',
        quantity: '100',
        price: '0.00'
      });

      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE trades \n             SET status = \'stopped\','),
        expect.arrayContaining(['t-123'])
      );
    });

    it('records the exchange fill price as the exit when SoDEX reports one', async () => {
      query.mockResolvedValueOnce([
        { id: 't-123', pair: 'BTC-USDC', quantity: '100', fill_price: '10.00', stop_loss_price: '9.20', status: 'filled' }
      ]);
      getTicker.mockResolvedValueOnce({ price: '9.10' });
      placeOrder.mockResolvedValueOnce({ orderId: 'sell-1', status: 'FILLED', price: '9.05' });

      await executeStopLossMonitoring();

      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'stopped'"),
        [expect.any(String), '9.0500', 't-123']
      );
    });

    it('leaves the trade open when the stop-loss sell order fails', async () => {
      query.mockResolvedValueOnce([
        { id: 't-123', pair: 'BTC-USDC', quantity: '100', fill_price: '10.00', stop_loss_price: '9.20', status: 'filled' }
      ]);
      getTicker.mockResolvedValueOnce({ price: '9.10' });
      placeOrder.mockRejectedValueOnce(new Error('SoDEX API returned business error'));

      await executeStopLossMonitoring();

      expect(execute).not.toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'stopped'"),
        expect.anything()
      );
    });
  });

  describe('checkMarketAndTrade (Hourly cycle integration)', () => {
    it('exits early if no narrative shift is detected by the shift detector', async () => {
      detectShift.mockResolvedValueOnce(null);

      await checkMarketAndTrade();
      expect(getAccountState).not.toHaveBeenCalled();
      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('reuses temperatures passed in by the scheduler instead of recording them again', async () => {
      detectShift.mockResolvedValueOnce(null);
      const temps = { 'NAR_01': 61.5, 'NAR_02': 40.0 };

      await checkMarketAndTrade(temps);
      expect(updateNarrativeTemperatures).not.toHaveBeenCalled();
      expect(detectShift).toHaveBeenCalledWith(temps);
    });

    it('runs pre-trade checks and publishes story without trading if risk gates fail', async () => {
      const detectedShift = {
        from_narrative: 'NAR_01',
        to_narrative: 'NAR_02',
        confidence: 90,
        signals: JSON.stringify(['flow_inflow'])
      };
      detectShift.mockResolvedValueOnce(detectedShift);

      // Trigger a risk gate failure: Disable Auto-trade
      process.env.AUTO_TRADE_ENABLED = 'false';

      await checkMarketAndTrade();

      // Should fetch account state to perform pre-trade checks
      expect(getAccountState).toHaveBeenCalled();
      // Should NOT execute order since check failed
      expect(placeOrder).not.toHaveBeenCalled();

      // Should generate LLM breaking story and save story + narrative shift to DB
      expect(createBreakingStory).toHaveBeenCalled();
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stories'),
        expect.any(Array)
      );
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO narrative_shifts'),
        expect.any(Array)
      );
    });

    it('places buy order, saves trade, shift and publishes story if all pre-trade check gates pass', async () => {
      const detectedShift = {
        from_narrative: 'NAR_01',
        to_narrative: 'NAR_02',
        confidence: 90,
        signals: JSON.stringify(['flow_inflow'])
      };
      detectShift.mockResolvedValueOnce(detectedShift);

      // Make sure all pre-trade checks pass
      process.env.AUTO_TRADE_ENABLED = 'true';
      query.mockResolvedValue([]); // no recent trades or open positions

      // Mock account balances
      getAccountState.mockResolvedValueOnce({
        balances: [{ asset: 'USDC', free: '10000.00', locked: '0.00' }]
      });
      // Mock portfolio value inputs
      fetchAccountBalances.mockResolvedValueOnce([
        { asset: 'USDC', free: '10000.00', locked: '0.00' }
      ]);

      // Mock ticker price of NAR_02 target token (NAR_02 maps to DOGE)
      // DOGE price = $0.15
      getTicker.mockResolvedValue({ price: '0.15' });

      // Sized allocation = 30% of $10,000 = $3,000. DOGE quantity = 3000 / 0.15 = 20000.
      placeOrder.mockResolvedValueOnce({
        orderId: 'sodex-order-abc',
        status: 'FILLED',
        price: '0.15'
      });

      await checkMarketAndTrade();

      // Verify trade executed on SoDEX
      expect(placeOrder).toHaveBeenCalledWith({
        pair: 'DOGE-USDC',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: '20000.0000',
        price: '0.00'
      });

      // Verify stories, trades, and narrative_shifts saved to database via batch
      expect(batch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sql: expect.stringContaining('INSERT INTO stories') }),
          expect.objectContaining({ sql: expect.stringContaining('INSERT INTO trades') }),
          expect.objectContaining({ sql: expect.stringContaining('INSERT INTO narrative_shifts') })
        ])
      );
    });
  });

  describe('Telegram Alerts Integration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('sends narrative shift alert on detected shift', async () => {
      const detectedShift = {
        from_narrative: 'NAR_01',
        to_narrative: 'NAR_02',
        confidence: 90,
        signals: JSON.stringify(['flow_inflow'])
      };
      detectShift.mockResolvedValueOnce(detectedShift);
      process.env.AUTO_TRADE_ENABLED = 'false';

      await checkMarketAndTrade();

      expect(sendNarrativeAlert).toHaveBeenCalledWith(detectedShift);
    });

    it('sends safety check alert on DAILY_LOSS_LIMIT_EXCEEDED risk check failure', async () => {
      const detectedShift = {
        from_narrative: 'NAR_01',
        to_narrative: 'NAR_02',
        confidence: 90,
        signals: JSON.stringify(['flow_inflow'])
      };
      detectShift.mockResolvedValueOnce(detectedShift);

      // Setup state to trigger DAILY_LOSS_LIMIT_EXCEEDED
      // Portfolio value is $10,000. Let's make closed trades in last 24h lose $2,000 (which is > 15%).
      process.env.AUTO_TRADE_ENABLED = 'true';
      query.mockImplementation(async (sql) => {
        if (sql.includes('FROM trades \n       WHERE (status = \'stopped\' OR status = \'closed\')')) {
          return [
            { fill_price: '10.00', stop_loss_price: '8.00', quantity: '1000', status: 'stopped', closed_at: new Date().toISOString() }
          ];
        }
        return [];
      });

      await checkMarketAndTrade();

      expect(sendMessage).toHaveBeenCalledWith(null, expect.stringContaining('Safety Check Failed: Drawdown limit reached.'));
    });

    it('sends trade filled alert on successful trade execution', async () => {
      const detectedShift = {
        from_narrative: 'NAR_01',
        to_narrative: 'NAR_02',
        confidence: 90,
        signals: JSON.stringify(['flow_inflow'])
      };
      detectShift.mockResolvedValueOnce(detectedShift);

      process.env.AUTO_TRADE_ENABLED = 'true';
      query.mockResolvedValue([]);
      getAccountState.mockResolvedValueOnce({
        balances: [{ asset: 'USDC', free: '10000.00', locked: '0.00' }]
      });
      fetchAccountBalances.mockResolvedValueOnce([
        { asset: 'USDC', free: '10000.00', locked: '0.00' }
      ]);
      getTicker.mockResolvedValue({ price: '0.15' });

      placeOrder.mockResolvedValueOnce({
        orderId: 'sodex-order-abc',
        status: 'FILLED',
        price: '0.15'
      });

      await checkMarketAndTrade();

      expect(sendMessage).toHaveBeenCalledWith(
        null,
        expect.stringContaining('[Cinder Trade Filled]')
      );
      expect(sendMessage).toHaveBeenCalledWith(
        null,
        expect.stringContaining('Asset:</b> DOGE')
      );
    });

    it('sends trade failed alert on failed trade execution', async () => {
      const detectedShift = {
        from_narrative: 'NAR_01',
        to_narrative: 'NAR_02',
        confidence: 90,
        signals: JSON.stringify(['flow_inflow'])
      };
      detectShift.mockResolvedValueOnce(detectedShift);

      process.env.AUTO_TRADE_ENABLED = 'true';
      query.mockResolvedValue([]);
      getAccountState.mockResolvedValueOnce({
        balances: [{ asset: 'USDC', free: '10000.00', locked: '0.00' }]
      });
      fetchAccountBalances.mockResolvedValueOnce([
        { asset: 'USDC', free: '10000.00', locked: '0.00' }
      ]);
      getTicker.mockResolvedValue({ price: '0.15' });

      placeOrder.mockResolvedValueOnce({
        status: 'FAILED',
        reason: 'INSUFFICIENT_FUNDS'
      });

      await checkMarketAndTrade();

      expect(sendMessage).toHaveBeenCalledWith(
        null,
        expect.stringContaining('[Cinder Trade Failed]')
      );
    });

    it('sends stop loss trigger alert on trailing stop-loss execution', async () => {
      query.mockResolvedValueOnce([
        { id: 't-123', pair: 'BTC-USDC', quantity: '0.1', stop_loss_price: '9.20' }
      ]);
      getTicker.mockResolvedValueOnce({ price: '9.1' });
      placeOrder.mockResolvedValueOnce({ status: 'FILLED' });

      await executeStopLossMonitoring();

      expect(sendMessage).toHaveBeenCalledWith(
        null,
        expect.stringContaining('[Cinder Stop-Loss Triggered]')
      );
      expect(sendMessage).toHaveBeenCalledWith(
        null,
        expect.stringContaining('Asset/Pair:</b> BTC-USDC')
      );
    });

    it('sends daily digest alert on calling sendDailyDigestAlert', async () => {
      process.env.USER_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
      process.env.AUTO_TRADE_ENABLED = 'true';
      process.env.SODEX_API_KEY_NAME = 'your_api_key_name'; // mock mode trigger

      // Mock DB query for open trades
      query.mockImplementation(async (sql) => {
        if (sql.includes("COUNT(*) as count FROM trades WHERE status = 'filled'")) {
          return [{ count: 1 }];
        }
        if (sql.includes("status = 'filled'")) {
          return [{ pair: 'BTC-USDC', quantity: '0.1', fill_price: '60000.00', stop_loss_price: '55200.00', side: 'buy' }];
        }
        if (sql.includes('FROM trades \n         WHERE (status = \'stopped\' OR status = \'closed\')')) {
          return [];
        }
        if (sql.includes('count FROM trades WHERE created_at')) {
          return [{ count: 0 }];
        }
        return [];
      });

      getTicker.mockResolvedValue({ price: '65000.00' });

      const success = await sendDailyDigestAlert();

      expect(success).toBe(true);
      expect(sendDailyDigest).toHaveBeenCalledWith(expect.objectContaining({
        balance: '10000.00',
        dailyReturn: '+0.00%',
        dailyTradesCount: 0,
        circuitBreakerStatus: 'NOMINAL',
        autoTradeEnabled: true,
        activeStopLossesCount: 1,
        positions: expect.any(Array)
      }));
    });
  });
});
