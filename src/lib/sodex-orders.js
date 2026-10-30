/**
 * Turns what a user types into a SoDEX spot order that passes the market's filters, and
 * reads SoDEX account data into plain numbers. No network or wallet access, so it can be tested.
 */

import { roundToStep, ORDER_SIDE, ORDER_TYPE, TIME_IN_FORCE } from './sodex-signing.js';

// Market buys are sized in USDC; two decimals is finer than any order Cinder needs
const FUNDS_STEP = '0.01';

/** Display names for a SoDEX market, e.g. vBTC_vUSDC -> {base: 'BTC', quote: 'USDC'}. */
export function marketLabels(symbol) {
  const [base, quote] = String(symbol?.displayName || '').split('/');
  return {
    base: base || String(symbol?.baseCoin || '').replace(/^v/, ''),
    quote: quote || String(symbol?.quoteCoin || '').replace(/^v/, '')
  };
}

/** Display name for a SoDEX coin, e.g. vBTC -> BTC. */
export function coinLabel(coin) {
  return String(coin || '').replace(/^v(?=[A-Z])/, '');
}

// Listed first in the market picker; the rest follow alphabetically, with SoDEX's test coins last
const LEADING_MARKETS = ['BTC', 'ETH', 'SOL'];

function marketRank(symbol) {
  const { base } = marketLabels(symbol);
  const leading = LEADING_MARKETS.indexOf(base);
  if (leading !== -1) return [0, leading, base];
  return [/^TEST/.test(base) ? 2 : 1, 0, base];
}

/** Markets that can be traded now, quoted in USDC, main coins first. */
export function tradableMarkets(symbols) {
  return (symbols || [])
    .filter(s => s.status === 'TRADING' && /USDC$/.test(s.quoteCoin || ''))
    .map(s => ({ symbol: s, rank: marketRank(s) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2].localeCompare(b.rank[2]))
    .map(entry => entry.symbol);
}

/** The USDC market for a coin the user holds, or undefined. */
export function marketForCoin(symbols, coin) {
  return tradableMarkets(symbols).find(s => s.baseCoin === coin);
}

/**
 * Free amount of a coin in a SoDEX balance list (total minus what open orders hold).
 * @param {Array<{coin: string, total: string, locked: string}>} balances
 */
export function availableOf(balances, coin) {
  const row = (balances || []).find(b => b.coin === coin);
  if (!row) return 0;
  return Math.max(0, parseFloat(row.total || 0) - parseFloat(row.locked || 0));
}

/** The USDC coin of a balance list ('vUSDC' on SoDEX, 'USDC' elsewhere). */
export function isCashCoin(coin) {
  return /^v?USDC$/.test(String(coin || ''));
}

/**
 * Builds a spot order from the trade form, checked against the market's filters.
 * @param {Object} args
 * @param {Object} args.symbol - A SoDEX spot symbol
 * @param {'buy'|'sell'} args.side
 * @param {'market'|'limit'} args.type
 * @param {string|number} args.amount - USDC to spend for a market buy, otherwise the quantity of the base coin
 * @param {string|number} [args.price] - Limit price
 * @param {number} [args.lastPrice] - Last traded price, used to estimate market orders
 * @returns {{ok: true, order: Object, notional: number} | {ok: false, error: string}}
 */
export function prepareSpotOrder({ symbol, side, type, amount, price, lastPrice }) {
  if (!symbol) return { ok: false, error: 'Pick a market.' };
  const { base, quote } = marketLabels(symbol);
  const minNotional = parseFloat(symbol.minNotional) || 0;
  const tooSmall = () => ({ ok: false, error: `The smallest order on ${base}/${quote} is ${minNotional} ${quote}.` });

  const sideCode = side === 'sell' ? ORDER_SIDE.SELL : ORDER_SIDE.BUY;
  const raw = parseFloat(amount);
  if (!(raw > 0)) return { ok: false, error: side === 'buy' && type === 'market' ? `Enter how much ${quote} to spend.` : `Enter a quantity of ${base}.` };

  if (type === 'market' && side === 'buy') {
    const funds = roundToStep(raw, FUNDS_STEP);
    if (minNotional && parseFloat(funds) < minNotional) return tooSmall();
    return {
      ok: true,
      notional: parseFloat(funds),
      order: { side: sideCode, type: ORDER_TYPE.MARKET, timeInForce: TIME_IN_FORCE.IOC, funds }
    };
  }

  const quantity = roundToStep(raw, symbol.stepSize);
  const minQuantity = Math.max(
    parseFloat(symbol.minQuantity) || 0,
    type === 'market' ? parseFloat(symbol.marketMinQuantity) || 0 : 0
  );
  if (!(parseFloat(quantity) > 0) || parseFloat(quantity) < minQuantity) {
    return { ok: false, error: `The smallest quantity on ${base}/${quote} is ${minQuantity || symbol.stepSize} ${base}.` };
  }

  if (type === 'market') {
    const notional = lastPrice > 0 ? parseFloat(quantity) * lastPrice : null;
    if (notional !== null && minNotional && notional < minNotional) return tooSmall();
    return {
      ok: true,
      notional,
      order: { side: sideCode, type: ORDER_TYPE.MARKET, timeInForce: TIME_IN_FORCE.IOC, quantity }
    };
  }

  const limit = roundToStep(parseFloat(price), symbol.tickSize);
  if (!(parseFloat(limit) > 0)) return { ok: false, error: `Enter a limit price in ${quote}.` };
  const notional = parseFloat(limit) * parseFloat(quantity);
  if (minNotional && notional < minNotional) return tooSmall();
  return {
    ok: true,
    notional,
    order: { side: sideCode, type: ORDER_TYPE.LIMIT, timeInForce: TIME_IN_FORCE.GTC, price: limit, quantity }
  };
}

/**
 * The first error in a SoDEX batch order answer, or null when every order was accepted.
 * SoDEX can refuse the whole batch (top-level error) or single orders (per-item code).
 */
export function batchError(result) {
  if (!result?.ok) return result?.error || 'SoDEX did not answer.';
  const items = Array.isArray(result.json?.data) ? result.json.data : [];
  const failed = items.find(item => item?.code !== 0);
  return failed ? failed.error || `SoDEX refused the order (code ${failed.code}).` : null;
}

/**
 * The fee rate the user has approved for a builder, in tenths of a basis point, or 0.
 * Orders carry the builder for the spot engine, so the spot approval is the one that counts.
 */
export function approvedBuilderFee(buildersResponse, builderID) {
  const spot = buildersResponse?.json?.data?.spot;
  const row = Array.isArray(spot) ? spot.find(b => Number(b.builderID) === Number(builderID)) : null;
  return row ? Number(row.feeRate) || 0 : 0;
}

/** A builder fee in tenths of a basis point as a percentage, e.g. 50 -> '0.05%'. */
export function formatFeeRate(tenthsOfBp) {
  return `${(tenthsOfBp / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}
