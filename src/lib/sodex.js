/**
 * SoDEX API Client with EIP-712 signing support.
 * Fully implemented REST client for market data and signed execution endpoints.
 */

import { ethers } from 'ethers';

/**
 * Helper to get the EIP-712 Domain for a given market and network environment.
 * @param {string} market - 'spot' or 'futures'
 * @param {boolean} isMainnet - network flag
 * @returns {Object} Domain object
 */
export function getDomain(market, isMainnet) {
  return {
    name: market || 'spot',
    version: '1',
    chainId: isMainnet ? 286623 : 138565,
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };
}

// Monotonic nonce counter to prevent collisions within the same millisecond
let _lastNonce = 0;
function nextNonce() {
  const now = Date.now();
  if (now <= _lastNonce) {
    _lastNonce += 1;
  } else {
    _lastNonce = now;
  }
  return _lastNonce;
}
const TYPES = {
  ExchangeAction: [
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint64' }
  ]
};

/**
 * Helper to order and sanitize parameters based on Go struct definition expectations.
 * Omits undefined/null values entirely.
 * DecimalString fields are cast to strings; limit is cast to number.
 * @param {string} actionType - 'newOrder' | 'cancelOrder' | ...
 * @param {Object} params - Raw parameters
 * @returns {Object} Cleaned and ordered parameters
 */
function cleanAndOrderParams(actionType, params) {
  if (!params) return {};

  if (actionType === 'newOrder') {
    // Exact Go struct field order: pair, side, orderType, quantity, price, stopPrice, funds
    const order = ['pair', 'side', 'orderType', 'quantity', 'price', 'stopPrice', 'funds'];
    const result = {};
    for (const key of order) {
      if (params[key] !== undefined && params[key] !== null) {
        if (['price', 'quantity', 'funds', 'stopPrice'].includes(key)) {
          result[key] = String(params[key]);
        } else {
          result[key] = params[key];
        }
      }
    }
    return result;
  }

  if (actionType === 'cancelOrder') {
    // Exact Go struct field order: orderId
    return { orderId: String(params.orderId) };
  }

  if (actionType === 'getAccountState' || actionType === 'getOpenOrders' || actionType === 'getApiKeys') {
    // Exact Go struct field order: userAddress
    return { userAddress: String(params.userAddress || '').toLowerCase() };
  }

  if (actionType === 'getTradeHistory') {
    // Exact Go struct field order: userAddress, limit
    const result = { userAddress: String(params.userAddress || '').toLowerCase() };
    if (params.limit !== undefined && params.limit !== null) {
      result.limit = Number(params.limit);
    }
    return result;
  }

  // Generic fallback preserving original keys but weeding out nulls/undefineds
  const result = {};
  for (const key of Object.keys(params)) {
    if (params[key] !== undefined && params[key] !== null) {
      result[key] = params[key];
    }
  }
  return result;
}

/**
 * Generates EIP-712 signature headers for SoDEX private endpoints.
 * Uses API key's private key, NOT the master wallet private key.
 * @param {string} actionType - 'newOrder' | 'cancelOrder' | 'transferAsset' | ...
 * @param {Object} params - Action-specific parameters matching Go struct orders
 * @param {string} apiKeyPrivateKey - API key's private key
 * @param {string} apiKeyName - Registered key name
 * @param {string} market - 'spot' or 'futures'
 * @param {boolean} isMainnet - network flag
 * @returns {Promise<Object>} Request headers object
 */
export async function getOrderSignatureHeaders(
  actionType, params, apiKeyPrivateKey, apiKeyName, market, isMainnet
) {
  if (!apiKeyPrivateKey) {
    throw new Error('API private key is required for EIP-712 signing');
  }
  if (!apiKeyName) {
    throw new Error('API key name is required for signature headers');
  }

  const wallet = new ethers.Wallet(apiKeyPrivateKey);
  const nonce = nextNonce();

  // 1. Build exactly what the server will re-marshal and compare against.
  const cleanedParams = cleanAndOrderParams(actionType, params);
  const payloadJson = JSON.stringify({ type: actionType, params: cleanedParams });

  // 2. Hash it
  const payloadHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadJson));

  // 3. Sign only {payloadHash, nonce}
  const domain = getDomain(market, isMainnet);
  const signature = await wallet._signTypedData(domain, TYPES, { payloadHash, nonce });

  // 4. Prefix with 0x01 representing the API key signature scheme
  const signaturePrefixed = '0x01' + signature.substring(2);

  return {
    'X-API-Key': apiKeyName,
    'X-API-Nonce': nonce.toString(),
    'X-API-Sign': signaturePrefixed,
    'Content-Type': 'application/json'
  };
}

/**
 * Dynamically constructs the base URL based on the market type and base config.
 * Supports environment variables and fallback paths.
 * @param {string} market - 'spot' or 'futures'
 * @returns {string} Fully resolved base URL
 */
function getSodexBaseUrl(market = 'spot') {
  let baseUrl = process.env.SODEX_API_BASE_URL || 'https://testnet-gw.sodex.dev/api/v1/spot';
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  if (baseUrl.endsWith('/spot') || baseUrl.endsWith('/futures')) {
    return baseUrl.replace(/\/(spot|futures)$/, `/${market}`);
  }
  return `${baseUrl}/${market}`;
}

/**
 * Common request handler that executes calls to the SoDEX API.
 * Automatically injects authentication headers if required.
 * @param {string} method - HTTP method
 * @param {string} path - Request path suffix
 * @param {Object} [body=null] - Request body
 * @param {string} [market='spot'] - 'spot' or 'futures'
 * @param {boolean} [requiresAuth=false] - Whether signature is required
 * @param {string} [actionType=''] - The ExchangeAction type (e.g. 'newOrder')
 * @param {Object} [params={}] - The params to be signed
 * @returns {Promise<any>} Response data
 */
async function callSodexApi(method, path, body = null, market = 'spot', requiresAuth = false, actionType = '', params = {}) {
  const baseUrl = getSodexBaseUrl(market);
  const url = `${baseUrl}${path}`;

  const headers = {
    'Accept': 'application/json'
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  if (requiresAuth) {
    const apiKeyPrivateKey = process.env.SODEX_API_KEY_PRIVATE_KEY;
    const apiKeyName = process.env.SODEX_API_KEY_NAME;
    const isMainnet = baseUrl.includes('mainnet');

    if (!apiKeyPrivateKey || !apiKeyName) {
      throw new Error(`Authentication credentials (SODEX_API_KEY_PRIVATE_KEY and SODEX_API_KEY_NAME) must be configured in environment variables for signed requests.`);
    }

    const authHeaders = await getOrderSignatureHeaders(
      actionType,
      params,
      apiKeyPrivateKey,
      apiKeyName,
      market,
      isMainnet
    );
    Object.assign(headers, authHeaders);
  }

  const options = {
    method,
    headers
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let errorDetails = '';
    try {
      const rawText = await response.text();
      try {
        const errJson = JSON.parse(rawText);
        errorDetails = errJson.message || rawText;
      } catch {
        errorDetails = rawText;
      }
    } catch {
      errorDetails = 'Failed to read response body';
    }
    throw new Error(`SoDEX API request failed: ${method} ${path} -> Status ${response.status} (${response.statusText}): ${errorDetails}`);
  }

  const result = await response.json();
  if (result && typeof result === 'object' && 'code' in result && 'data' in result) {
    if (result.code !== 0 && result.code !== 200 && result.code !== 201) {
      throw new Error(`SoDEX API returned business error: Code ${result.code} - ${result.message || 'Unknown error'}`);
    }
    return result.data;
  }
  return result;
}

/* ========================================== */
/* Public Market Data Endpoints (No Auth)     */
/* ========================================== */

/**
 * Fetches current ticker price and volume details for a pair.
 * @param {string} pair - e.g., 'BTC-USDC'
 * @param {string} [market='spot'] - market type ('spot' | 'futures')
 * @returns {Promise<Object>} Ticker details
 */
export async function getTicker(pair, market = 'spot') {
  try {
    return await callSodexApi('GET', `/ticker?pair=${encodeURIComponent(pair)}`, null, market);
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
            return {
              pair,
              price: parseFloat(price).toString()
            };
          }
        }
      }
    } catch {
      console.warn(`[WARNING] CoinGecko public API fallback failed for ${pair}.`);
    }
    throw err;
  }
}

/**
 * Fetches bid/ask levels for a pair.
 * @param {string} pair - e.g., 'BTC-USDC'
 * @param {number} [depth=20] - Order book depth
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Object>} Bids and asks arrays
 */
export async function getOrderBook(pair, depth = 20, market = 'spot') {
  return callSodexApi('GET', `/orderbook?pair=${encodeURIComponent(pair)}&depth=${depth}`, null, market);
}

/**
 * Fetches OHLCV klines (candles) for a pair.
 * @param {string} pair - e.g., 'BTC-USDC'
 * @param {string} interval - candle interval (e.g., '1h')
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Array>} Klines array
 */
export async function getKlines(pair, interval, market = 'spot') {
  return callSodexApi('GET', `/klines?pair=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}`, null, market);
}

/**
 * Fetches available trading pairs/markets.
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Array>} Markets list
 */
export async function getMarkets(market = 'spot') {
  return callSodexApi('GET', '/markets', null, market);
}

/* ========================================== */
/* Signed Endpoints (Requires EIP-712 Auth)   */
/* ========================================== */

/**
 * Places a trade order on SoDEX.
 * @param {Object} orderParams - order properties (pair, side, orderType, quantity, price)
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Object>} Order execution result
 */
export async function placeOrder(orderParams, market = 'spot') {
  return callSodexApi(
    'POST',
    '/trade/orders',
    orderParams,
    market,
    true,
    'newOrder',
    orderParams
  );
}

/**
 * Cancels an active order on SoDEX.
 * @param {string} orderId - Target order ID to cancel
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Object>} Cancellation confirmation
 */
export async function cancelOrder(orderId, market = 'spot') {
  return callSodexApi(
    'DELETE',
    `/trade/orders/${encodeURIComponent(orderId)}`,
    null,
    market,
    true,
    'cancelOrder',
    { orderId }
  );
}

/**
 * Fetches spot balances and margin position state.
 * @param {string} userAddress - Wallet address
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Object>} Account balances and status
 */
export async function getAccountState(userAddress, market = 'spot') {
  const data = await callSodexApi(
    'GET',
    `/accounts/${encodeURIComponent(userAddress.toLowerCase())}/state`,
    null,
    market,
    true,
    'getAccountState',
    { userAddress }
  );
  return {
    accountId: data.accountId,
    walletAddress: data.walletAddress || userAddress,
    balances: data.balances || []
  };
}

/**
 * Gets open orders for a wallet.
 * @param {string} userAddress - Wallet address
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Array>} List of open orders
 */
export async function getOpenOrders(userAddress, market = 'spot') {
  return callSodexApi(
    'GET',
    `/accounts/${encodeURIComponent(userAddress.toLowerCase())}/open-orders`,
    null,
    market,
    true,
    'getOpenOrders',
    { userAddress }
  );
}

/**
 * Retrieves past fills / trade history.
 * @param {string} userAddress - Wallet address
 * @param {number} [limit=50] - Result limit
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Array>} List of trades
 */
export async function getTradeHistory(userAddress, limit = 50, market = 'spot') {
  return callSodexApi(
    'GET',
    `/accounts/${encodeURIComponent(userAddress.toLowerCase())}/trades?limit=${limit}`,
    null,
    market,
    true,
    'getTradeHistory',
    { userAddress, limit }
  );
}

/**
 * Fetches registered API keys for an address on SoDEX.
 * @param {string} userAddress - Wallet address
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Array>} List of API key names
 */
export async function getApiKeys(userAddress, market = 'spot') {
  return callSodexApi(
    'GET',
    `/accounts/${encodeURIComponent(userAddress.toLowerCase())}/api-keys`,
    null,
    market,
    true,
    'getApiKeys',
    { userAddress }
  );
}

/**
 * Helper alias function to fetch only the balances array for a user.
 * @param {string} userAddress - Wallet address
 * @param {string} [market='spot'] - market type
 * @returns {Promise<Array>} List of balances
 */
export async function fetchAccountBalances(userAddress, market = 'spot') {
  const state = await getAccountState(userAddress, market);
  return state.balances;
}

// Aliases for compatibility with other naming conventions
export {
  placeOrder as executeSodexOrder,
  getTicker as getSodexTicker
};
