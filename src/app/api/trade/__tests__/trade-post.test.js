import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/db.js', () => ({
  query: vi.fn(),
  execute: vi.fn(),
  initializeDb: vi.fn()
}));

vi.mock('../../../../lib/sodex.js', () => ({
  getAccountState: vi.fn(),
  placeOrder: vi.fn(),
  getTicker: vi.fn()
}));

import { POST, GET } from '../route.js';
import { query, execute } from '../../../../lib/db.js';
import { getAccountState, placeOrder, getTicker } from '../../../../lib/sodex.js';

const SECRET = 'test-internal-secret';
const CINDER_ADDRESS = '0x1234567890123456789012345678901234567890';

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

const trusted = { 'x-internal-api-secret': SECRET };

describe('POST /api/trade', () => {
  const originalEnv = { ...process.env };
  const order = { pair: 'BTC-USDC', side: 'buy', orderType: 'market', quantity: '0.1', price: '60000' };

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = SECRET;
    delete process.env.USER_WALLET_ADDRESS;
    delete process.env.SODEX_API_KEY_NAME;
    query.mockResolvedValue([]);
    execute.mockResolvedValue({ rowsAffected: 1 });
    getTicker.mockResolvedValue({ price: '60000' });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('rejects a request without the internal secret', async () => {
      const res = await POST(makeRequest(order));
      expect(res.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a wrong internal secret', async () => {
      const res = await POST(makeRequest(order, { 'x-internal-api-secret': 'wrong' }));
      expect(res.status).toBe(401);
    });

    it('no longer accepts wallet-signed orders from users', async () => {
      const res = await POST(makeRequest({ ...order, clientWallet: CINDER_ADDRESS, signature: '0x1234', nonce: Date.now() }));
      expect(res.status).toBe(401);
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  it('returns 400 when required parameters are missing', async () => {
    const res = await POST(makeRequest({ pair: 'BTC-USDC' }, trusted));
    expect(res.status).toBe(400);
  });

  describe('pricing', () => {
    it('fills at the server price, not the price in the request', async () => {
      getTicker.mockResolvedValue({ price: '61000' });
      const res = await POST(makeRequest({ ...order, price: '1' }, trusted));
      const data = await res.json();

      expect(data.fillPrice).toBe('61000');
    });

    it('rejects live trades when no live price is available', async () => {
      process.env.USER_WALLET_ADDRESS = CINDER_ADDRESS;
      process.env.SODEX_API_KEY_NAME = 'live-key';
      getTicker.mockRejectedValue(new Error('SoDEX and CoinGecko down'));

      const res = await POST(makeRequest(order, trusted));
      expect(res.status).toBe(503);
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('demo mode (no SoDEX credentials)', () => {
    it('simulates a fill without calling SoDEX and records the trade', async () => {
      const res = await POST(makeRequest(order, trusted));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.status).toBe('FILLED');
      expect(data.simulated).toBe(true);
      expect(data.sodexOrderId).toMatch(/^ord_mock_/);
      expect(data.fillPrice).toBe('60000');
      expect(placeOrder).not.toHaveBeenCalled();

      const tradeInsert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO trades'));
      expect(tradeInsert).toBeDefined();
      // Default 8% stop-loss below the fill for a buy
      expect(tradeInsert[1][7]).toBe('55200.0000');
    });

    it('writes nothing but the trade itself', async () => {
      await POST(makeRequest(order, trusted));
      const tables = execute.mock.calls.map(([sql]) => sql.match(/INSERT INTO (\w+)/)?.[1]).filter(Boolean);
      expect(tables).toEqual(['trades']);
    });
  });

  describe('live mode (SoDEX credentials configured)', () => {
    beforeEach(() => {
      process.env.USER_WALLET_ADDRESS = CINDER_ADDRESS;
      process.env.SODEX_API_KEY_NAME = 'live-key';
    });

    it('places the order on SoDEX and records it against Cinder\'s account', async () => {
      placeOrder.mockResolvedValue({ orderId: 'sodex-1', status: 'FILLED', fillPrice: '60010' });

      const res = await POST(makeRequest(order, trusted));
      const data = await res.json();

      expect(placeOrder).toHaveBeenCalledOnce();
      expect(data.sodexOrderId).toBe('sodex-1');
      expect(data.fillPrice).toBe('60010');
      expect(data.simulated).toBe(false);
      const tradeInsert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO trades'));
      expect(tradeInsert[1][1]).toBe(CINDER_ADDRESS);
    });

    it('records a failed SoDEX order as simulated, not filled', async () => {
      placeOrder.mockRejectedValue(new Error('SoDEX down'));

      const res = await POST(makeRequest(order, trusted));
      const data = await res.json();

      expect(data.status).toBe('SIMULATED');
      expect(data.simulated).toBe(true);
      expect(data.sodexOrderId).toMatch(/^ord_sim_/);
      const tradeInsert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO trades'));
      expect(tradeInsert[1][9]).toBe('simulated');
    });
  });
});

describe('GET /api/trade', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.USER_WALLET_ADDRESS;
    delete process.env.SODEX_API_KEY_NAME;
    query.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('shows the demo account when SoDEX is not configured', async () => {
    const res = await GET(new Request('http://localhost/api/trade'));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.positions.map(p => p.asset)).toEqual(['BTC', 'ETH']);
    expect(getAccountState).not.toHaveBeenCalled();
  });

  it('reads Cinder\'s own account and USDC balance when SoDEX is configured', async () => {
    process.env.USER_WALLET_ADDRESS = CINDER_ADDRESS;
    process.env.SODEX_API_KEY_NAME = 'live-key';
    getAccountState.mockResolvedValue({ balances: [{ asset: 'vUSDC', amount: '250.5' }, { asset: 'BTC', amount: '0.01' }] });
    getTicker.mockResolvedValue({ price: '70000' });

    const res = await GET(new Request('http://localhost/api/trade'));
    const data = await res.json();

    expect(getAccountState).toHaveBeenCalledWith(CINDER_ADDRESS);
    expect(data.balance).toBe('250.50');
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0]).toMatchObject({ asset: 'BTC', value: '700.00' });
  });

  it('returns a ticker price', async () => {
    getTicker.mockResolvedValue({ price: '65000' });
    const res = await GET(new Request('http://localhost/api/trade?ticker=BTC-USDC'));
    const data = await res.json();

    expect(data).toMatchObject({ success: true, price: '65000' });
  });
});
