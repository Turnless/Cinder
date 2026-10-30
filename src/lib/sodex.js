/**
 * Server-side SoDEX client for Cinder's own account: the automatic trader, the Telegram
 * status command and /api/trade. Reads are public GETs; orders are signed with Cinder's API key
 * (SODEX_API_KEY_NAME, SODEX_API_KEY_PRIVATE_KEY) on the account of USER_WALLET_ADDRESS.
 * The network comes from NEXT_PUBLIC_SODEX_NETWORK, the same setting the browser uses.
 *
 * Callers name markets as pairs like 'BTC-USDC'; they are mapped to SoDEX symbols like vBTC_vUSDC.
 * Users never trade through this file; their orders are signed in the browser (sodex-browser.js).
 */

import { getSodexNetwork } from './sodex-network.js';
import {
  buildSpotNewOrderParams,
  buildSpotCancelParams,
  signSpotAction,
  roundToStep,
  SPOT_ACTION,
  ORDER_SIDE,
  ORDER_TYPE,
  TIME_IN_FORCE
} from './sodex-signing.js';
import { marketLabels, tradableMarkets, coinLabel, batchError } from './sodex-orders.js';

const SYMBOLS_TTL_MS = 10 * 60 * 1000;
// How long to look for the fills of a market order before reporting what was found
const FILL_POLL_ATTEMPTS = 4;
const FILL_POLL_DELAY_MS = 1000;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** The network this deployment trades on. Read per call so tests and scripts can change it. */
export function getNetwork() {
  return getSodexNetwork();
}

/**
 * GET a SoDEX endpoint and return `data`, or throw with SoDEX's own error text.
 * @param {string} url
 */
async function sodexGet(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  return readData(response, `GET ${url}`);
}

async function readData(response, label) {
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Left as null; the raw text explains the failure
  }
  if (!response.ok || !json || json.code !== 0) {
    const reason = json?.error || json?.message || text || response.statusText;
    throw new Error(`SoDEX ${label} failed (${response.status}): ${reason}`);
  }
  return json.data;
}

/* ---------- Markets ---------- */

let symbolsCache = { network: null, at: 0, symbols: [] };

/** Spot markets quoted in USDC that are trading now, cached for 10 minutes. */
export async function getMarkets() {
  const network = getNetwork();
  if (symbolsCache.network === network.name && Date.now() - symbolsCache.at < SYMBOLS_TTL_MS) {
    return symbolsCache.symbols;
  }
  const symbols = tradableMarkets(await sodexGet(`${network.spotBase}/markets/symbols`));
  symbolsCache = { network: network.name, at: Date.now(), symbols };
  return symbols;
}

/** Clears the market cache; for tests. */
export function resetMarketCache() {
  symbolsCache = { network: null, at: 0, symbols: [] };
}

/**
 * The SoDEX market for a pair such as 'BTC-USDC'.
 * @param {string} pair
 * @returns {Promise<Object>} A SoDEX spot symbol
 */
export async function getSymbolForPair(pair) {
  const base = String(pair || '').split('-')[0].toUpperCase();
  const symbol = (await getMarkets()).find(s => marketLabels(s).base.toUpperCase() === base);
  if (!symbol) throw new Error(`SoDEX has no USDC market for ${pair}`);
  return symbol;
}

/**
 * Last traded price for a pair, falling back to CoinGecko when SoDEX has none.
 * @param {string} pair - e.g. 'BTC-USDC'
 * @returns {Promise<{pair: string, symbol?: string, price: string}>}
 */
export async function getTicker(pair) {
  try {
    const symbol = await getSymbolForPair(pair);
    const data = await sodexGet(`${getNetwork().spotBase}/markets/tickers?symbol=${encodeURIComponent(symbol.name)}`);
    const last = parseFloat(data?.[0]?.lastPx);
    if (!(last > 0)) throw new Error(`SoDEX has no recent trades for ${symbol.name}`);
    return { pair, symbol: symbol.name, price: data[0].lastPx };
  } catch (err) {
    try {
      const baseToken = pair.split('-')[0].toUpperCase();
      const coinIdMap = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', UNI: 'uniswap', AAVE: 'aave', DOGE: 'dogecoin' };
      const coinId = coinIdMap[baseToken];
      if (coinId) {
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const data = await response.json();
          const price = data[coinId]?.usd;
          if (price) {
            console.warn(`[WARNING] Using CoinGecko fallback price for ${pair}.`);
            return { pair, price: parseFloat(price).toString() };
          }
        }
      }
    } catch {
      console.warn(`[WARNING] CoinGecko public API fallback failed for ${pair}.`);
    }
    throw err;
  }
}

/** Order book for a pair. */
export async function getOrderBook(pair, depth = 20) {
  const symbol = await getSymbolForPair(pair);
  return sodexGet(`${getNetwork().spotBase}/markets/${encodeURIComponent(symbol.name)}/orderbook?limit=${depth}`);
}

/** Candles for a pair, e.g. interval '1h'. */
export async function getKlines(pair, interval) {
  const symbol = await getSymbolForPair(pair);
  return sodexGet(`${getNetwork().spotBase}/markets/${encodeURIComponent(symbol.name)}/klines?interval=${encodeURIComponent(interval)}`);
}

/* ---------- Account ---------- */

/**
 * Spot account of a wallet with balances in a shape every caller can read:
 * {asset: 'BTC', coin: 'vBTC', free, locked, amount}, amounts as decimal strings.
 * @param {string} userAddress
 * @returns {Promise<{accountId: number, walletAddress: string, balances: Array}>}
 */
export async function getAccountState(userAddress) {
  const data = await sodexGet(`${getNetwork().spotBase}/accounts/${userAddress.toLowerCase()}/state`);
  if (!data?.aid) throw new Error(`${userAddress} has no ${getNetwork().label} account`);
  const balances = (data.B || []).map(b => {
    const total = parseFloat(b.t || 0);
    const locked = parseFloat(b.l || 0);
    return {
      asset: coinLabel(b.a),
      coin: b.a,
      free: String(Math.max(0, total - locked)),
      locked: String(locked),
      amount: String(total)
    };
  });
  return { accountId: data.aid, walletAddress: data.user || userAddress, balances };
}

/** Just the balances of getAccountState. */
export async function fetchAccountBalances(userAddress) {
  return (await getAccountState(userAddress)).balances;
}

/** Open spot orders of a wallet. */
export async function getOpenOrders(userAddress) {
  const data = await sodexGet(`${getNetwork().spotBase}/accounts/${userAddress.toLowerCase()}/orders`);
  return data?.orders || [];
}

/** Recent spot fills of a wallet, newest first. */
export async function getTradeHistory(userAddress, limit = 50) {
  const data = await sodexGet(`${getNetwork().spotBase}/accounts/${userAddress.toLowerCase()}/trades?limit=${limit}`);
  return Array.isArray(data) ? data : [];
}

/** API keys registered on a wallet's primary account, per engine. */
export async function getApiKeys(userAddress) {
  const { primaryAccountID } = await sodexGet(`${getNetwork().publicBase}/user/${userAddress}/subaccounts`);
  return sodexGet(`${getNetwork().publicBase}/user/${userAddress}/api-keys?accountID=${primaryAccountID}`);
}

/* ---------- Cinder's orders ---------- */

function getCredentials() {
  const keyName = process.env.SODEX_API_KEY_NAME;
  const privateKey = process.env.SODEX_API_KEY_PRIVATE_KEY;
  const address = process.env.USER_WALLET_ADDRESS;
  if (!keyName || !privateKey || !address) {
    throw new Error('SODEX_API_KEY_NAME, SODEX_API_KEY_PRIVATE_KEY and USER_WALLET_ADDRESS must be set to trade on SoDEX');
  }
  return { keyName, privateKey, address };
}

async function sendSigned(method, type, params, privateKey, keyName) {
  const network = getNetwork();
  const { headers, body } = await signSpotAction({ privateKey, keyName, sodexChainId: network.chainId, type, params });
  const response = await fetch(`${network.spotBase}/trade/orders/batch`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Left as null; batchError reports the raw text
  }
  const result = { ok: response.ok && json?.code === 0, json, error: json?.error || text || response.statusText };
  const error = batchError(result);
  if (error) throw new Error(`SoDEX refused the ${type}: ${error}`);
  return json.data;
}

/**
 * Fills of one order, summed: how much was executed and at what average price.
 * Market orders settle within a block or two, so this looks a few times.
 */
async function findFills(address, orderID, attempts = FILL_POLL_ATTEMPTS) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(FILL_POLL_DELAY_MS);
    try {
      const fills = (await getTradeHistory(address, 20)).filter(t => String(t.orderID) === String(orderID));
      if (fills.length > 0) {
        const quantity = fills.reduce((sum, t) => sum + parseFloat(t.quantity), 0);
        const value = fills.reduce((sum, t) => sum + parseFloat(t.quantity) * parseFloat(t.price), 0);
        return { quantity, price: quantity > 0 ? value / quantity : null };
      }
    } catch (err) {
      console.warn(`[WARNING] Could not read fills for order ${orderID}:`, err.message);
    }
  }
  return { quantity: 0, price: null };
}

/**
 * Places a spot order on Cinder's account and reports how it filled.
 * Sells never ask for more than the account holds, since fees can leave slightly less than was bought.
 * @param {{pair: string, side: string, orderType: string, quantity: string|number, price?: string|number}} orderParams
 * @returns {Promise<{orderId: string, clOrdID: string, status: 'FILLED'|'NEW'|'UNFILLED',
 *   quantity: string, executedQty: string, price?: string, fillPrice?: string}>}
 */
export async function placeOrder(orderParams) {
  const { keyName, privateKey, address } = getCredentials();
  const symbol = await getSymbolForPair(orderParams.pair);
  const state = await getAccountState(address);
  const isSell = String(orderParams.side).toLowerCase() === 'sell';
  const isLimit = String(orderParams.orderType).toLowerCase() === 'limit';

  let wanted = parseFloat(orderParams.quantity);
  if (isSell) {
    const held = parseFloat(state.balances.find(b => b.coin === symbol.baseCoin)?.free || 0);
    wanted = Math.min(wanted, held);
  }
  const quantity = roundToStep(wanted, symbol.stepSize);
  if (!(parseFloat(quantity) > 0) || parseFloat(quantity) < (parseFloat(symbol.minQuantity) || 0)) {
    throw new Error(`Order quantity ${orderParams.quantity} for ${symbol.name} is below the minimum ${symbol.minQuantity}`);
  }

  const clOrdID = `cinder-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const order = {
    symbolID: symbol.id,
    clOrdID,
    side: isSell ? ORDER_SIDE.SELL : ORDER_SIDE.BUY,
    type: isLimit ? ORDER_TYPE.LIMIT : ORDER_TYPE.MARKET,
    timeInForce: isLimit ? TIME_IN_FORCE.GTC : TIME_IN_FORCE.IOC,
    quantity
  };
  if (isLimit) order.price = roundToStep(orderParams.price, symbol.tickSize);

  const params = buildSpotNewOrderParams({ accountID: state.accountId, orders: [order] });
  const data = await sendSigned('POST', SPOT_ACTION.NEW_ORDER, params, privateKey, keyName);
  const orderId = String(data?.[0]?.orderID ?? '');

  // A limit order may rest on the book; a market order fills now or not at all
  const fills = await findFills(address, orderId, isLimit ? 1 : FILL_POLL_ATTEMPTS);
  const filledEnough = fills.quantity > 0 && (!isLimit || fills.quantity >= parseFloat(quantity) * 0.999);
  const status = filledEnough ? 'FILLED' : isLimit ? 'NEW' : 'UNFILLED';
  const result = { orderId, clOrdID, status, quantity, executedQty: String(fills.quantity) };
  if (fills.price) {
    result.price = String(fills.price);
    result.fillPrice = String(fills.price);
  }
  return result;
}

/**
 * Cancels one of Cinder's open orders.
 * @param {{pair: string, orderId?: string|number, clOrdID?: string}} args
 */
export async function cancelOrder({ pair, orderId, clOrdID }) {
  const { keyName, privateKey, address } = getCredentials();
  const symbol = await getSymbolForPair(pair);
  const state = await getAccountState(address);
  const params = buildSpotCancelParams({
    accountID: state.accountId,
    cancels: [{
      symbolID: symbol.id,
      clOrdID: `x${Date.now().toString(36)}`,
      ...(clOrdID ? { origClOrdID: clOrdID } : { orderID: Number(orderId) })
    }]
  });
  return sendSigned('DELETE', SPOT_ACTION.CANCEL_ORDER, params, privateKey, keyName);
}

// Aliases for compatibility with other naming conventions
export {
  placeOrder as executeSodexOrder,
  getTicker as getSodexTicker
};
