import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import {
  getMarkets,
  getSymbolForPair,
  getTicker,
  getAccountState,
  fetchAccountBalances,
  placeOrder,
  cancelOrder,
  resetMarketCache
} from '../sodex.js';
import { payloadHash } from '../sodex-signing.js';

// Throwaway key used only by these tests
const API_KEY = new ethers.Wallet('0x' + '44'.repeat(32));
const CINDER = '0x1234567890123456789012345678901234567890';
const GW = 'https://testnet-gw.sodex.dev/api/v1';

const BTC = {
  id: 1, name: 'vBTC_vUSDC', displayName: 'BTC/USDC', baseCoin: 'vBTC', quoteCoin: 'vUSDC', status: 'TRADING',
  tickSize: '1', stepSize: '0.00001', minQuantity: '0.00001', marketMinQuantity: '0.00001', minNotional: '5'
};
const HALTED = { ...BTC, id: 2, name: 'vETH_vUSDC', displayName: 'ETH/USDC', baseCoin: 'vETH', status: 'HALT' };

const ok = (data) => ({ ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ code: 0, data }) });
const refused = (error) => ({ ok: false, status: 400, statusText: 'Bad Request', text: async () => JSON.stringify({ code: -1, error }) });

/**
 * A fake SoDEX gateway: answers by URL and records every request.
 * @param {Object} overrides - URL substring -> response (or function returning one)
 */
function mockGateway(overrides = {}) {
  const routes = {
    '/spot/markets/symbols': ok([BTC, HALTED]),
    '/spot/markets/tickers': ok([{ symbol: 'vBTC_vUSDC', lastPx: '78591' }]),
    '/state': ok({ user: CINDER.toLowerCase(), aid: 777, B: [{ i: 0, a: 'vUSDC', t: '100', l: '6' }, { i: 1, a: 'vBTC', t: '0.0005', l: '0' }] }),
    '/trade/orders/batch': ok([{ code: 0, clOrdID: 'x', orderID: 4242 }]),
    '/trades': ok([
      { orderID: 4242, price: '78000', quantity: '0.0001' },
      { orderID: 4242, price: '79000', quantity: '0.0001' },
      { orderID: 1, price: '1', quantity: '9' }
    ]),
    ...overrides
  };
  const fetchMock = vi.fn(async (url) => {
    const key = Object.keys(routes).find(k => String(url).includes(k));
    if (!key) throw new Error(`Unexpected request ${url}`);
    return typeof routes[key] === 'function' ? routes[key](url) : routes[key];
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('server SoDEX client', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    resetMarketCache();
    process.env.NEXT_PUBLIC_SODEX_NETWORK = 'testnet';
    process.env.SODEX_API_KEY_NAME = 'cinder-auto';
    process.env.SODEX_API_KEY_PRIVATE_KEY = API_KEY.privateKey;
    process.env.USER_WALLET_ADDRESS = CINDER;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  // Fill polling waits between reads; run those waits instantly
  const settle = async (promise) => {
    const result = promise.then(value => ({ value }), error => ({ error }));
    await vi.runAllTimersAsync();
    const { value, error } = await result;
    if (error) throw error;
    return value;
  };

  describe('markets', () => {
    it('keeps trading USDC markets and caches them', async () => {
      const fetchMock = mockGateway();
      expect((await getMarkets()).map(s => s.name)).toEqual(['vBTC_vUSDC']);
      await getMarkets();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(`${GW}/spot/markets/symbols`);
    });

    it('maps a pair to its SoDEX market', async () => {
      mockGateway();
      expect((await getSymbolForPair('BTC-USDC')).name).toBe('vBTC_vUSDC');
      await expect(getSymbolForPair('DOGE-USDC')).rejects.toThrow(/no USDC market for DOGE-USDC/);
    });

    it('uses the mainnet gateway when the deployment is set to mainnet', async () => {
      process.env.NEXT_PUBLIC_SODEX_NETWORK = 'mainnet';
      const fetchMock = mockGateway();
      await getMarkets();
      expect(fetchMock.mock.calls[0][0]).toBe('https://mainnet-gw.sodex.dev/api/v1/spot/markets/symbols');
    });
  });

  describe('getTicker', () => {
    it('returns the last traded price of the market', async () => {
      const fetchMock = mockGateway();
      expect(await getTicker('BTC-USDC')).toEqual({ pair: 'BTC-USDC', symbol: 'vBTC_vUSDC', price: '78591' });
      expect(fetchMock.mock.calls[1][0]).toBe(`${GW}/spot/markets/tickers?symbol=vBTC_vUSDC`);
    });

    it('falls back to CoinGecko when SoDEX has no price', async () => {
      mockGateway({
        '/spot/markets/tickers': ok([]),
        'coingecko': { ok: true, json: async () => ({ bitcoin: { usd: 80000 } }) }
      });
      expect(await getTicker('BTC-USDC')).toEqual({ pair: 'BTC-USDC', price: '80000' });
    });
  });

  describe('getAccountState', () => {
    it('reads the spot state into named balances', async () => {
      mockGateway();
      const state = await getAccountState(CINDER);
      expect(state.accountId).toBe(777);
      expect(state.balances).toEqual([
        { asset: 'USDC', coin: 'vUSDC', free: '94', locked: '6', amount: '100' },
        { asset: 'BTC', coin: 'vBTC', free: '0.0005', locked: '0', amount: '0.0005' }
      ]);
      expect(await fetchAccountBalances(CINDER)).toHaveLength(2);
    });

    it('throws for a wallet without a SoDEX account', async () => {
      mockGateway({ '/state': ok({ user: '0x0000000000000000000000000000000000000000', aid: 0, B: [] }) });
      await expect(getAccountState(CINDER)).rejects.toThrow(/no SoDEX testnet account/);
    });
  });

  describe('placeOrder', () => {
    it('signs a batchNewOrder with Cinder\'s key and reports the average fill', async () => {
      const fetchMock = mockGateway();
      const result = await settle(placeOrder({ pair: 'BTC-USDC', side: 'BUY', orderType: 'MARKET', quantity: '0.000209', price: '0.00' }));

      const [url, options] = fetchMock.mock.calls.find(([u]) => u.includes('/trade/orders/batch'));
      expect(url).toBe(`${GW}/spot/trade/orders/batch`);
      expect(options.method).toBe('POST');

      const params = JSON.parse(options.body);
      expect(params.accountID).toBe(777);
      expect(params.orders[0]).toMatchObject({ symbolID: 1, side: 1, type: 2, timeInForce: 3, quantity: '0.0002' });
      expect(params.orders[0].price).toBeUndefined();

      // The signature recovers to the API key over the batchNewOrder payload
      expect(options.headers['X-API-Key']).toBe('cinder-auto');
      const signature = '0x' + options.headers['X-API-Sign'].slice(4);
      const recovered = ethers.utils.verifyTypedData(
        { name: 'spot', version: '1', chainId: 138565, verifyingContract: '0x0000000000000000000000000000000000000000' },
        { ExchangeAction: [{ name: 'payloadHash', type: 'bytes32' }, { name: 'nonce', type: 'uint64' }] },
        { payloadHash: payloadHash('batchNewOrder', params), nonce: Number(options.headers['X-API-Nonce']) },
        signature
      );
      expect(recovered).toBe(API_KEY.address);

      expect(result).toMatchObject({ orderId: '4242', status: 'FILLED', quantity: '0.0002', executedQty: '0.0002' });
      expect(parseFloat(result.fillPrice)).toBeCloseTo(78500);
    });

    it('never sells more than the account holds', async () => {
      const fetchMock = mockGateway();
      await settle(placeOrder({ pair: 'BTC-USDC', side: 'SELL', orderType: 'MARKET', quantity: '0.0009' }));
      const [, options] = fetchMock.mock.calls.find(([u]) => u.includes('/trade/orders/batch'));
      expect(JSON.parse(options.body).orders[0]).toMatchObject({ side: 2, quantity: '0.0005' });
    });

    it('reports a market order SoDEX did not fill as UNFILLED', async () => {
      mockGateway({ '/trades': ok([]) });
      const result = await settle(placeOrder({ pair: 'BTC-USDC', side: 'BUY', orderType: 'MARKET', quantity: '0.0002' }));
      expect(result.status).toBe('UNFILLED');
      expect(result.fillPrice).toBeUndefined();
    });

    it('throws with SoDEX\'s reason when the order is refused', async () => {
      mockGateway({ '/trade/orders/batch': ok([{ code: 3, clOrdID: 'x', error: 'insufficient balance' }]) });
      await expect(settle(placeOrder({ pair: 'BTC-USDC', side: 'BUY', orderType: 'MARKET', quantity: '0.0002' })))
        .rejects.toThrow(/insufficient balance/);
    });

    it('throws when the whole batch is refused', async () => {
      mockGateway({ '/trade/orders/batch': refused('API key not found') });
      await expect(settle(placeOrder({ pair: 'BTC-USDC', side: 'BUY', orderType: 'MARKET', quantity: '0.0002' })))
        .rejects.toThrow(/API key not found/);
    });

    it('refuses to trade without credentials', async () => {
      delete process.env.SODEX_API_KEY_PRIVATE_KEY;
      mockGateway();
      await expect(placeOrder({ pair: 'BTC-USDC', side: 'BUY', orderType: 'MARKET', quantity: '0.0002' }))
        .rejects.toThrow(/SODEX_API_KEY_PRIVATE_KEY/);
    });

    it('places a limit order on the tick size', async () => {
      const fetchMock = mockGateway({ '/trades': ok([]) });
      const result = await settle(placeOrder({ pair: 'BTC-USDC', side: 'BUY', orderType: 'LIMIT', quantity: '0.0001', price: '60000.7' }));
      const [, options] = fetchMock.mock.calls.find(([u]) => u.includes('/trade/orders/batch'));
      expect(JSON.parse(options.body).orders[0]).toMatchObject({ type: 1, timeInForce: 1, price: '60000', quantity: '0.0001' });
      expect(result.status).toBe('NEW');
    });
  });

  describe('cancelOrder', () => {
    it('cancels by order ID with a DELETE batch', async () => {
      const fetchMock = mockGateway();
      await cancelOrder({ pair: 'BTC-USDC', orderId: '4242' });
      const [url, options] = fetchMock.mock.calls.find(([u]) => u.includes('/trade/orders/batch'));
      expect(url).toBe(`${GW}/spot/trade/orders/batch`);
      expect(options.method).toBe('DELETE');
      expect(JSON.parse(options.body).cancels[0]).toMatchObject({ symbolID: 1, orderID: 4242 });
    });
  });
});
