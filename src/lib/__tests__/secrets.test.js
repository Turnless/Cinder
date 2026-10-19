import { describe, it, expect, afterEach } from 'vitest';
import { safeEqual, hasValidInternalSecret } from '../secrets.js';
import { verifyTelegramSignature } from '../telegram.js';

describe('safeEqual', () => {
  it('matches identical strings only', () => {
    expect(safeEqual('s3cret', 's3cret')).toBe(true);
    expect(safeEqual('s3cret', 's3creT')).toBe(false);
    expect(safeEqual('s3cret', 's3cret-longer')).toBe(false);
  });

  it('never matches a missing or empty secret', () => {
    expect(safeEqual(undefined, 's3cret')).toBe(false);
    expect(safeEqual(null, null)).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('hasValidInternalSecret', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const req = (value) => new Request('http://localhost', value ? { headers: { 'x-internal-api-secret': value } } : {});

  it('accepts the configured secret', () => {
    process.env.INTERNAL_API_SECRET = 'abc123';
    expect(hasValidInternalSecret(req('abc123'))).toBe(true);
  });

  it('rejects a wrong or missing header', () => {
    process.env.INTERNAL_API_SECRET = 'abc123';
    expect(hasValidInternalSecret(req('nope'))).toBe(false);
    expect(hasValidInternalSecret(req())).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    delete process.env.INTERNAL_API_SECRET;
    expect(hasValidInternalSecret(req())).toBe(false);
  });
});

describe('verifyTelegramSignature', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts the webhook secret Telegram echoes back', () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'hook-secret';
    expect(verifyTelegramSignature('hook-secret', '{}')).toBe(true);
    expect(verifyTelegramSignature('wrong', '{}')).toBe(false);
  });

  it('no longer falls back to the bot token', () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = '123:abc';
    expect(verifyTelegramSignature('123:abc', '{}')).toBe(false);
  });
});
