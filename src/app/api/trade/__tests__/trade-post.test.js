import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

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

import { POST } from '../route.js';
import { query, execute } from '../../../../lib/db.js';
import { placeOrder } from '../../../../lib/sodex.js';

const SECRET = 'test-internal-secret';

function makeRequest(body, headers = {}) {
  return new Request('http://localhost/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

// Signs an order exactly the way QuickTrade does, against the chain the route verifies with
async function signOrder(wallet, order, nonce) {
  const domain = {
    name: 'spot',
    version: '1',
    chainId: 421614,
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };
  const types = {
    ExchangeAction: [
      { name: 'payloadHash', type: 'bytes32' },
      { name: 'nonce', type: 'uint64' }
    ]
  };
  const params = {
    pair: order.pair,
    side: order.side,
    orderType: order.orderType,
    quantity: String(order.quantity),
    price: String(order.price || '0.0'),
    stopPrice: order.stopLossPrice ? String(order.stopLossPrice) : '0.0'
  };
  const payloadHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(JSON.stringify({ type: 'newOrder', params }))
  );
  return wallet._signTypedData(domain, types, { payloadHash, nonce });
}

describe('POST /api/trade', () => {
  const originalEnv = { ...process.env };
  const order = { pair: 'BTC-USDC', side: 'buy', orderType: 'market', quantity: '0.1', price: '60000' };

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = SECRET;
    delete process.env.USER_WALLET_ADDRESS;
    delete process.env.SODEX_API_KEY_NAME;
    delete process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
    delete process.env.CHAIN_ID;
    query.mockResolvedValue([]);
    execute.mockResolvedValue({ rowsAffected: 1 });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('rejects a request with neither the internal secret nor a wallet signature', async () => {
      const res = await POST(makeRequest(order));
      expect(res.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a wrong internal secret', async () => {
      const res = await POST(makeRequest(order, { 'x-internal-api-secret': 'wrong' }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature from a different wallet than clientWallet', async () => {
      const signer = ethers.Wallet.createRandom();
      const other = ethers.Wallet.createRandom();
      const nonce = Date.now();
      const signature = await signOrder(signer, order, nonce);

      const res = await POST(makeRequest({ ...order, clientWallet: other.address, signature, nonce }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature over different order parameters', async () => {
      const signer = ethers.Wallet.createRandom();
      const nonce = Date.now();
      const signature = await signOrder(signer, order, nonce);

      const res = await POST(makeRequest({ ...order, quantity: '5', clientWallet: signer.address, signature, nonce }));
      expect(res.status).toBe(401);
    });

    it('accepts a valid wallet signature', async () => {
      const signer = ethers.Wallet.createRandom();
      const nonce = Date.now();
      const signature = await signOrder(signer, order, nonce);

      const res = await POST(makeRequest({ ...order, clientWallet: signer.address, signature, nonce }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  it('returns 400 when required parameters are missing', async () => {
    const res = await POST(makeRequest({ pair: 'BTC-USDC' }, { 'x-internal-api-secret': SECRET }));
    expect(res.status).toBe(400);
  });

  describe('demo mode (no SoDEX credentials)', () => {
    it('simulates a fill without calling SoDEX and records the trade', async () => {
      const res = await POST(makeRequest(order, { 'x-internal-api-secret': SECRET }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.status).toBe('FILLED');
      expect(data.sodexOrderId).toMatch(/^ord_mock_/);
      expect(data.fillPrice).toBe('60000');
      expect(placeOrder).not.toHaveBeenCalled();

      const tradeInsert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO trades'));
      expect(tradeInsert).toBeDefined();
      // Default 8% stop-loss below the fill for a buy
      expect(tradeInsert[1][7]).toBe('55200.0000');
    });

    it('debits the cost of a buy from the wallet balance', async () => {
      const signer = ethers.Wallet.createRandom();
      const nonce = Date.now();
      const signature = await signOrder(signer, order, nonce);
      query.mockImplementation(async (sql) =>
        sql.includes('FROM wallet_balances') ? [{ balance: '10000.00' }] : []
      );

      await POST(makeRequest({ ...order, clientWallet: signer.address, signature, nonce }));

      const balanceWrite = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO wallet_balances'));
      expect(balanceWrite[1]).toEqual([signer.address.toLowerCase(), '4000.00']);
    });
  });

  describe('live mode (SoDEX credentials configured)', () => {
    beforeEach(() => {
      process.env.USER_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
      process.env.SODEX_API_KEY_NAME = 'live-key';
    });

    it('places the order on SoDEX and returns its result', async () => {
      placeOrder.mockResolvedValue({ orderId: 'sodex-1', status: 'FILLED', fillPrice: '60010' });

      const res = await POST(makeRequest(order, { 'x-internal-api-secret': SECRET }));
      const data = await res.json();

      expect(placeOrder).toHaveBeenCalledOnce();
      expect(data.sodexOrderId).toBe('sodex-1');
      expect(data.fillPrice).toBe('60010');
    });

    // Current behaviour, slated to change in Phase 2 (a failed live order should not look filled)
    it('falls back to a simulated fill when SoDEX rejects the order', async () => {
      placeOrder.mockRejectedValue(new Error('SoDEX down'));

      const res = await POST(makeRequest(order, { 'x-internal-api-secret': SECRET }));
      const data = await res.json();

      expect(data.status).toBe('FILLED');
      expect(data.sodexOrderId).toMatch(/^ord_sim_/);
    });
  });
});
