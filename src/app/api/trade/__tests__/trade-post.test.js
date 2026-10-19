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

// Keep the real treasury/token helpers; stub the parts that would touch the chain
vi.mock('../../../../lib/cndr.js', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyCndrPayment: vi.fn(),
  sendCndrPayout: vi.fn()
}));

import { POST, GET } from '../route.js';
import { query, execute } from '../../../../lib/db.js';
import { placeOrder, getTicker } from '../../../../lib/sodex.js';
import { verifyCndrPayment, sendCndrPayout } from '../../../../lib/cndr.js';

const SECRET = 'test-internal-secret';
const TOKEN = '0x6C64923FD6478D265A1b5a971c6bC59cB35A5FA7';
const TX_HASH = '0x' + 'ab'.repeat(32);

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

// Builds a wallet-signed request body for an order
async function signedBody(wallet, order, extra = {}, nonce = Date.now()) {
  const signature = await signOrder(wallet, order, nonce);
  return { ...order, clientWallet: wallet.address, signature, nonce, ...extra };
}

describe('POST /api/trade', () => {
  const originalEnv = { ...process.env };
  const order = { pair: 'BTC-USDC', side: 'buy', orderType: 'market', quantity: '0.1', price: '60000' };

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = SECRET;
    delete process.env.USER_WALLET_ADDRESS;
    delete process.env.SODEX_API_KEY_NAME;
    delete process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
    delete process.env.TREASURY_PRIVATE_KEY;
    delete process.env.CHAIN_ID;
    query.mockResolvedValue([]);
    execute.mockResolvedValue({ rowsAffected: 1 });
    getTicker.mockResolvedValue({ price: '60000' });
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
      const body = await signedBody(signer, order);

      const res = await POST(makeRequest({ ...body, clientWallet: other.address }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature over different order parameters', async () => {
      const signer = ethers.Wallet.createRandom();
      const body = await signedBody(signer, order);

      const res = await POST(makeRequest({ ...body, quantity: '5' }));
      expect(res.status).toBe(401);
    });

    it('accepts a valid wallet signature', async () => {
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, order)));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('replay protection', () => {
    it('rejects a signed order without a nonce', async () => {
      const signer = ethers.Wallet.createRandom();
      const body = await signedBody(signer, order);
      delete body.nonce;

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(401);
    });

    it('rejects a signature older than 5 minutes', async () => {
      const signer = ethers.Wallet.createRandom();
      const body = await signedBody(signer, order, {}, Date.now() - 6 * 60 * 1000);

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();
    });

    it('rejects the same signed order submitted twice', async () => {
      const signer = ethers.Wallet.createRandom();
      const body = await signedBody(signer, order);
      execute.mockImplementation(async (sql) => {
        if (sql.includes('INSERT INTO trade_nonces')) {
          throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: trade_nonces.wallet_address, trade_nonces.nonce');
        }
        return { rowsAffected: 1 };
      });

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(409);
      expect(execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO trades'))).toBe(false);
    });

    it('records the nonce for the signing wallet', async () => {
      const signer = ethers.Wallet.createRandom();
      const body = await signedBody(signer, order);

      await POST(makeRequest(body));
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trade_nonces'),
        [signer.address.toLowerCase(), String(body.nonce)]
      );
    });
  });

  it('returns 400 when required parameters are missing', async () => {
    const res = await POST(makeRequest({ pair: 'BTC-USDC' }, { 'x-internal-api-secret': SECRET }));
    expect(res.status).toBe(400);
  });

  describe('pricing', () => {
    it('fills at the server price, not the price in the request', async () => {
      getTicker.mockResolvedValue({ price: '61000' });
      const signer = ethers.Wallet.createRandom();
      const res = await POST(makeRequest(await signedBody(signer, { ...order, price: '1' })));
      const data = await res.json();

      expect(data.fillPrice).toBe('61000');
    });

    it('fills demo limit orders at the server price too', async () => {
      const signer = ethers.Wallet.createRandom();
      const limitOrder = { ...order, orderType: 'limit', price: '999999' };
      const res = await POST(makeRequest(await signedBody(signer, limitOrder)));
      const data = await res.json();

      expect(data.fillPrice).toBe('60000');
    });

    it('rejects live trades when no live price is available', async () => {
      process.env.USER_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
      process.env.SODEX_API_KEY_NAME = 'live-key';
      getTicker.mockRejectedValue(new Error('SoDEX and CoinGecko down'));

      const res = await POST(makeRequest(order, { 'x-internal-api-secret': SECRET }));
      expect(res.status).toBe(503);
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('SELL position check', () => {
    const sellOrder = { pair: 'BTC-USDC', side: 'sell', orderType: 'market', quantity: '0.5', price: '60000' };

    function holdings(rows) {
      query.mockImplementation(async (sql) => (sql.includes('LOWER(side)') ? rows : []));
    }

    it('rejects selling more than the wallet holds', async () => {
      holdings([{ side: 'buy', quantity: '0.3' }]);
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, sellOrder)));
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toMatch(/Insufficient position/);
      expect(sendCndrPayout).not.toHaveBeenCalled();
    });

    it('rejects a sell from a wallet with no position at all', async () => {
      holdings([]);
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, sellOrder)));
      expect(res.status).toBe(400);
    });

    it('subtracts earlier sells from the position', async () => {
      holdings([{ side: 'buy', quantity: '1.0' }, { side: 'sell', quantity: '0.7' }]);
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, sellOrder)));
      expect(res.status).toBe(400);
    });

    it('allows selling a held position, tolerating 6-decimal rounding', async () => {
      holdings([{ side: 'buy', quantity: '0.4999996' }]);
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, sellOrder)));
      expect(res.status).toBe(200);
    });

    it('pays out CNDR at the server price for a settled sell', async () => {
      process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS = TOKEN;
      holdings([{ side: 'buy', quantity: '1' }]);
      const signer = ethers.Wallet.createRandom();

      await POST(makeRequest(await signedBody(signer, { ...sellOrder, price: '9999999' })));
      expect(sendCndrPayout).toHaveBeenCalledWith(signer.address, 0.5 * 60000);
    });
  });

  describe('BUY payment with CNDR deployed', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS = TOKEN;
      process.env.USER_WALLET_ADDRESS = '0x00000000000000000000000000000000000000aa';
      verifyCndrPayment.mockResolvedValue({ ok: true, paid: '6000.0' });
    });

    it('requires a payment transaction', async () => {
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, order)));
      expect(res.status).toBe(402);
      expect(verifyCndrPayment).not.toHaveBeenCalled();
    });

    it('checks the payment went from the signer to the treasury for the server-priced cost', async () => {
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, order, { txHash: TX_HASH })));
      expect(res.status).toBe(200);
      expect(verifyCndrPayment).toHaveBeenCalledWith(expect.objectContaining({
        txHash: TX_HASH,
        from: signer.address,
        to: process.env.USER_WALLET_ADDRESS
      }));
      const { minAmount } = verifyCndrPayment.mock.calls[0][0];
      expect(minAmount).toBeCloseTo(0.1 * 60000 * 0.98);
    });

    it('rejects a payment that does not verify', async () => {
      verifyCndrPayment.mockResolvedValue({ ok: false, reason: 'Payment too small' });
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, order, { txHash: TX_HASH })));
      const data = await res.json();
      expect(res.status).toBe(402);
      expect(data.error).toBe('Payment too small');
    });

    it('rejects a payment transaction that was already used', async () => {
      execute.mockImplementation(async (sql) => {
        if (sql.includes('INSERT INTO cndr_payments')) {
          throw new Error('UNIQUE constraint failed: cndr_payments.tx_hash');
        }
        return { rowsAffected: 1 };
      });
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, order, { txHash: TX_HASH })));
      expect(res.status).toBe(409);
    });

    it('pays to the dedicated treasury when TREASURY_PRIVATE_KEY is set', async () => {
      const treasury = ethers.Wallet.createRandom();
      process.env.TREASURY_PRIVATE_KEY = treasury.privateKey;
      const signer = ethers.Wallet.createRandom();

      await POST(makeRequest(await signedBody(signer, order, { txHash: TX_HASH })));
      expect(verifyCndrPayment).toHaveBeenCalledWith(expect.objectContaining({ to: treasury.address }));
    });

    it('returns 503 when no treasury is configured', async () => {
      delete process.env.USER_WALLET_ADDRESS;
      const signer = ethers.Wallet.createRandom();

      const res = await POST(makeRequest(await signedBody(signer, order, { txHash: TX_HASH })));
      expect(res.status).toBe(503);
    });
  });

  describe('demo mode (no SoDEX credentials)', () => {
    it('simulates a fill without calling SoDEX and records the trade', async () => {
      const res = await POST(makeRequest(order, { 'x-internal-api-secret': SECRET }));
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

    it('debits the cost of a buy from the wallet balance', async () => {
      const signer = ethers.Wallet.createRandom();
      query.mockImplementation(async (sql) =>
        sql.includes('FROM wallet_balances') ? [{ balance: '10000.00' }] : []
      );

      await POST(makeRequest(await signedBody(signer, order)));

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
      expect(data.simulated).toBe(false);
    });

    it('records a failed SoDEX order as simulated, not filled', async () => {
      placeOrder.mockRejectedValue(new Error('SoDEX down'));

      const res = await POST(makeRequest(order, { 'x-internal-api-secret': SECRET }));
      const data = await res.json();

      expect(data.status).toBe('SIMULATED');
      expect(data.simulated).toBe(true);
      expect(data.sodexOrderId).toMatch(/^ord_sim_/);
      const tradeInsert = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO trades'));
      expect(tradeInsert[1][9]).toBe('simulated');
    });

    it('does not pay out a sell that SoDEX has not filled yet', async () => {
      process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS = TOKEN;
      placeOrder.mockResolvedValue({ orderId: 'sodex-2', status: 'NEW' });
      const sellOrder = { ...order, side: 'sell' };

      await POST(makeRequest(sellOrder, { 'x-internal-api-secret': SECRET }));
      expect(sendCndrPayout).not.toHaveBeenCalled();
    });
  });
});

describe('GET /api/trade?masterAddress=true', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TREASURY_PRIVATE_KEY;
    delete process.env.USER_WALLET_ADDRESS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  const get = () => GET(new Request('http://localhost/api/trade?masterAddress=true'));

  it('returns the dedicated treasury address when TREASURY_PRIVATE_KEY is set', async () => {
    const treasury = ethers.Wallet.createRandom();
    process.env.TREASURY_PRIVATE_KEY = treasury.privateKey;
    process.env.USER_WALLET_ADDRESS = '0x00000000000000000000000000000000000000aa';

    const data = await (await get()).json();
    expect(data.masterAddress).toBe(treasury.address);
  });

  it('falls back to USER_WALLET_ADDRESS', async () => {
    process.env.USER_WALLET_ADDRESS = '0x00000000000000000000000000000000000000aa';

    const data = await (await get()).json();
    expect(data.masterAddress).toBe('0x00000000000000000000000000000000000000aa');
  });

  it('returns 503 instead of a hard-coded address when nothing is configured', async () => {
    const res = await get();
    expect(res.status).toBe(503);
  });
});
