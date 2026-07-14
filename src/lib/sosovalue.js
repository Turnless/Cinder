/**
 * SoSoValue API Client wrapper.
 * Implementation for fetching ETF flows, news feed, sector performance, and coin data.
 */

// Sliding window rate limiter configuration (Demo tier allows 20 calls/min)
const requestTimestamps = [];
const LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;
let queuePromise = Promise.resolve();

/**
 * Handles sliding window rate limiting.
 * Queues requests sequentially and introduces delays if the 20 calls/min limit is hit.
 */
async function rateLimit() {
  const previousQueue = queuePromise;
  let resolveQueue;
  queuePromise = new Promise(resolve => {
    resolveQueue = resolve;
  });

  await previousQueue;

  try {
    const now = Date.now();
    // Remove timestamps that fall outside the rolling 60-second window
    while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - LIMIT_WINDOW_MS) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length >= MAX_REQUESTS) {
      const oldestTimestamp = requestTimestamps[0];
      const waitTime = oldestTimestamp + LIMIT_WINDOW_MS - now;
      if (waitTime > 0) {
        console.warn(`[SoSoValue Rate Limit] Limit reached. Waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      // Re-clean timestamps after waiting
      const postWaitNow = Date.now();
      while (requestTimestamps.length > 0 && requestTimestamps[0] <= postWaitNow - LIMIT_WINDOW_MS) {
        requestTimestamps.shift();
      }
    }
    requestTimestamps.push(Date.now());
  } finally {
    resolveQueue();
  }
}

/**
 * Common request helper with authorization, rate-limiting, and automatic retries.
 */
async function fetchFromSoSoValue(endpoint, params = {}) {
  const apiKey = process.env.SOSOVALUE_API_KEY || '';
  const baseUrl = process.env.SOSOVALUE_API_URL || 'https://api.sosovalue.xyz/v1';

  const url = new URL(`${baseUrl}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const headers = {
    'Accept': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const maxAttempts = 3;
  const initialDelay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await rateLimit();

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.code !== 200) {
        throw new Error(data.message || `API returned error code ${data.code}`);
      }

      return data.data;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(`[SoSoValue Client] Request to ${endpoint} failed after ${maxAttempts} attempts:`, error);
        throw error;
      }
      const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
      console.warn(`[SoSoValue Client] Request failed (attempt ${attempt}/${maxAttempts}). Retrying in ${backoffDelay}ms... Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
}

/**
 * Fetches daily ETF net flows for a specific asset (BTC or ETH).
 * @param {string} asset - 'BTC' or 'ETH'
 * @param {string|number} [period] - Optional period filter (e.g. '7d', '30d')
 * @returns {Promise<Array>} Normalized flow records
 */
export async function getETFFlows(asset, period) {
  let days = 7;
  if (period) {
    if (typeof period === 'number') {
      days = period;
    } else if (typeof period === 'string') {
      const match = period.match(/^(\d+)d$/i);
      if (match) {
        days = parseInt(match[1], 10);
      } else {
        const num = parseInt(period, 10);
        if (!isNaN(num)) {
          days = num;
        }
      }
    }
  }
  return fetchFromSoSoValue(`/etf/${asset.toLowerCase()}/flow`, { days });
}

/**
 * Fetches historical ETF flow series.
 * @param {string} asset - 'BTC' or 'ETH'
 * @param {number} [days=7] - Number of historical days
 * @returns {Promise<Array>} Historical flow data series
 */
export async function getETFHistorical(asset, days = 7) {
  return fetchFromSoSoValue(`/etf/${asset.toLowerCase()}/flow`, { days });
}

/**
 * Fetches AI-curated crypto news items.
 * @param {number} [limit=20] - Max items to return
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<Array>} Normalized news items
 */
export async function getAINewsFeed(limit = 20, offset = 0) {
  return fetchFromSoSoValue('/news/ai-feed', { limit, offset });
}

/**
 * Fetches performance stats for all sectors (SSI protocol indices).
 * @returns {Promise<Array>} Normalized sector performance data
 */
export async function getSectorPerformance() {
  return fetchFromSoSoValue('/indices/sectors');
}

/**
 * Fetches composition details of a specific sector index.
 * @param {string} index - e.g., 'AI.ssi'
 * @returns {Promise<Object>} Sector constituents and weights
 */
export async function getSectorComposition(index) {
  const sectors = await getSectorPerformance();
  if (Array.isArray(sectors)) {
    const matched = sectors.find(s => s.indexName.toLowerCase() === index.toLowerCase());
    if (matched) {
      return matched;
    }
  }
  return { indexName: index, tokens: [] };
}

/**
 * Fetches price, volume, and market cap for a given coin symbol.
 * @param {string} symbol - e.g., 'BTC' or 'FET'
 * @returns {Promise<Object>} Coin market data
 */
export async function getCoinData(symbol) {
  return fetchFromSoSoValue('/coin/data', { symbol });
}

