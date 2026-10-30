import { describe, it, expect } from 'vitest';
import {
  marketLabels,
  coinLabel,
  tradableMarkets,
  marketForCoin,
  availableOf,
  isCashCoin,
  prepareSpotOrder,
  batchError,
  approvedBuilderFee,
  formatFeeRate
} from '../sodex-orders';

// vBTC_vUSDC as SoDEX testnet lists it
const BTC = {
  id: 1, name: 'vBTC_vUSDC', displayName: 'BTC/USDC', baseCoin: 'vBTC', quoteCoin: 'vUSDC', status: 'TRADING',
  tickSize: '1', stepSize: '0.00001', minQuantity: '0.00001', marketMinQuantity: '0.00001', minNotional: '5'
};
const ETH = { ...BTC, id: 2, name: 'vETH_vUSDC', displayName: 'ETH/USDC', baseCoin: 'vETH', tickSize: '0.1', stepSize: '0.0001', minQuantity: '0.0001', marketMinQuantity: '0.0001' };

describe('market helpers', () => {
  it('names markets and coins without the v prefix', () => {
    expect(marketLabels(BTC)).toEqual({ base: 'BTC', quote: 'USDC' });
    expect(coinLabel('vBTC')).toBe('BTC');
    expect(coinLabel('vUSDC')).toBe('USDC');
  });

  it('keeps only USDC markets that are trading', () => {
    const halted = { ...ETH, status: 'HALT' };
    const usdt = { ...BTC, id: 9, quoteCoin: 'vUSDT' };
    expect(tradableMarkets([BTC, halted, usdt]).map(s => s.id)).toEqual([1]);
    const doge = { ...BTC, id: 3, displayName: 'DOGE/USDC', baseCoin: 'vDOGE' };
    const aave = { ...BTC, id: 4, displayName: 'AAVE/USDC', baseCoin: 'vAAVE' };
    const test = { ...BTC, id: 5, displayName: 'TESTBTC/USDC', baseCoin: 'TESTBTC' };
    expect(tradableMarkets([test, doge, ETH, aave, BTC]).map(s => s.id)).toEqual([1, 2, 4, 3, 5]);
    expect(marketForCoin([BTC, ETH], 'vETH').id).toBe(2);
    expect(marketForCoin([BTC], 'vDOGE')).toBeUndefined();
  });

  it('reads the free part of a balance', () => {
    const balances = [{ coin: 'vUSDC', total: '100', locked: '6.29' }];
    expect(availableOf(balances, 'vUSDC')).toBeCloseTo(93.71);
    expect(availableOf(balances, 'vBTC')).toBe(0);
    expect(isCashCoin('vUSDC')).toBe(true);
    expect(isCashCoin('vBTC')).toBe(false);
  });
});

describe('prepareSpotOrder', () => {
  it('sizes a market buy in USDC with IOC', () => {
    const result = prepareSpotOrder({ symbol: BTC, side: 'buy', type: 'market', amount: '10.129' });
    expect(result).toEqual({ ok: true, notional: 10.12, order: { side: 1, type: 2, timeInForce: 3, funds: '10.12' } });
  });

  it('refuses a market buy under the minimum notional', () => {
    const result = prepareSpotOrder({ symbol: BTC, side: 'buy', type: 'market', amount: '4.99' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/smallest order on BTC\/USDC is 5 USDC/);
  });

  it('sizes a market sell by quantity, rounded down to the step', () => {
    const result = prepareSpotOrder({ symbol: BTC, side: 'sell', type: 'market', amount: '0.000129', lastPrice: 80000 });
    expect(result.ok).toBe(true);
    expect(result.order).toEqual({ side: 2, type: 2, timeInForce: 3, quantity: '0.00012' });
  });

  it('refuses a market sell worth less than the minimum notional', () => {
    const result = prepareSpotOrder({ symbol: BTC, side: 'sell', type: 'market', amount: '0.00005', lastPrice: 80000 });
    expect(result.ok).toBe(false);
  });

  it('builds a limit order on the tick and step, with no trailing zeros', () => {
    const result = prepareSpotOrder({ symbol: ETH, side: 'buy', type: 'limit', amount: '0.01009', price: '3000.06' });
    expect(result.order).toEqual({ side: 1, type: 1, timeInForce: 1, price: '3000', quantity: '0.01' });
    expect(result.notional).toBeCloseTo(30);
  });

  it('asks for the missing input', () => {
    expect(prepareSpotOrder({ symbol: BTC, side: 'buy', type: 'market', amount: '' }).error).toMatch(/how much USDC/);
    expect(prepareSpotOrder({ symbol: BTC, side: 'sell', type: 'limit', amount: '0.001', price: '' }).error).toMatch(/limit price/);
    expect(prepareSpotOrder({ symbol: BTC, side: 'sell', type: 'market', amount: '0.000001' }).error).toMatch(/smallest quantity/);
  });
});

describe('SoDEX answers', () => {
  it('finds the error in a batch answer', () => {
    expect(batchError({ ok: true, json: { code: 0, data: [{ code: 0, orderID: 1 }] } })).toBeNull();
    expect(batchError({ ok: true, json: { code: 0, data: [{ code: 5, error: 'insufficient balance' }] } })).toBe('insufficient balance');
    expect(batchError({ ok: false, error: 'API key not found' })).toBe('API key not found');
  });

  it('reads the approved spot builder fee', () => {
    const response = { json: { data: { spot: [{ userID: 1, builderID: 77, feeRate: 50 }], perps: [] } } };
    expect(approvedBuilderFee(response, 77)).toBe(50);
    expect(approvedBuilderFee(response, 78)).toBe(0);
    expect(approvedBuilderFee({ json: { data: { spot: [], perps: [] } } }, 77)).toBe(0);
  });

  it('formats a fee rate as a percentage', () => {
    expect(formatFeeRate(50)).toBe('0.05%');
    expect(formatFeeRate(100)).toBe('0.1%');
    expect(formatFeeRate(1000)).toBe('1%');
  });
});
