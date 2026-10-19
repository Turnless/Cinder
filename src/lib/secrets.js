import crypto from 'crypto';

/**
 * Constant-time string comparison for shared secrets, so response timing
 * doesn't reveal how many leading characters of a guess were right.
 * @param {string} provided - Value supplied by the caller
 * @param {string} expected - Configured secret
 * @returns {boolean} True only when both are non-empty strings and identical
 */
export function safeEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Checks the x-internal-api-secret header against INTERNAL_API_SECRET.
 * @param {Request} request - Incoming request
 * @returns {boolean} True when the header matches a configured secret
 */
export function hasValidInternalSecret(request) {
  return safeEqual(request.headers.get('x-internal-api-secret'), process.env.INTERNAL_API_SECRET);
}
