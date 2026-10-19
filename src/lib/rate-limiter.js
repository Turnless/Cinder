/**
 * In-memory sliding window rate limiter for Next.js API Routes.
 * Since Vercel Serverless Functions have ephemeral scopes, we use an in-process cache
 * as a robust local control, with a fallback config.
 */

const ipCache = new Map();
let lastSweep = Date.now();

// Standard rate limit window configuration
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MIN = 60; // 60 requests per minute per IP

/**
 * Checks if a given IP has exceeded its request limits.
 * @param {string} ip - Requesting Client IP address
 * @param {number} [limit=60] - Max requests allowed
 * @param {number} [windowMs=60000] - Window duration
 * @returns {Object} Object indicating if they are rate limited, and header values
 */
export function rateLimit(ip, limit = MAX_REQUESTS_PER_MIN, windowMs = WINDOW_MS) {
  const now = Date.now();

  // Drop IPs with no requests in the window so the map doesn't grow for the life of the process
  if (now - lastSweep > windowMs) {
    for (const [key, times] of ipCache) {
      if (!times.some(time => time > now - windowMs)) {
        ipCache.delete(key);
      }
    }
    lastSweep = now;
  }

  if (!ipCache.has(ip)) {
    ipCache.set(ip, []);
  }

  const timestamps = ipCache.get(ip);

  // Filter out timestamps outside the current sliding window
  const activeTimestamps = timestamps.filter(time => time > now - windowMs);
  
  const currentRequests = activeTimestamps.length;
  const isLimited = currentRequests >= limit;

  if (!isLimited) {
    activeTimestamps.push(now);
    ipCache.set(ip, activeTimestamps);
  }

  return {
    success: !isLimited,
    limit,
    remaining: Math.max(0, limit - activeTimestamps.length),
    reset: now + windowMs
  };
}

// Number of IPs currently tracked (used by tests to check stale entries are dropped)
export function trackedIpCount() {
  return ipCache.size;
}
