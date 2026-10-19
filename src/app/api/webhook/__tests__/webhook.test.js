import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route.js';
import { query, execute } from '../../../../lib/db.js';
import { sendMessage, verifyTelegramSignature } from '../../../../lib/telegram.js';

vi.mock('../../../../lib/db.js', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

vi.mock('../../../../lib/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(true),
  verifyTelegramSignature: vi.fn().mockReturnValue(true)
}));

vi.mock('../../../../lib/sodex.js', () => ({
  getAccountState: vi.fn()
}));

vi.mock('../../../../lib/rate-limiter.js', () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true })
}));

describe('POST /api/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_CHAT_ID = '12345';
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test_webhook_secret';
  });

  it('fails closed with 500 when TELEGRAM_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    verifyTelegramSignature.mockReturnValueOnce(false);
    const req = {
      headers: { get: () => 'anything' },
      text: async () => JSON.stringify({ message: { text: '/help', chat: { id: 111 } } })
    };

    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('rejects unauthorised signatures', async () => {
    verifyTelegramSignature.mockReturnValueOnce(false);
    const req = {
      headers: {
        get: (key) => {
          if (key === 'x-telegram-bot-api-secret-token') return 'bad_signature';
          return '127.0.0.1';
        }
      },
      text: async () => JSON.stringify({ message: { text: '/help', chat: { id: 111 } } })
    };

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('restricts /pause to admin chat id', async () => {
    const req = {
      headers: { get: () => 'test_bot_token' },
      text: async () => JSON.stringify({ message: { text: '/pause', chat: { id: 99999 } } }) // not admin ID 12345
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(99999, expect.stringContaining('Access Denied'));
    expect(global.tradingPaused).not.toBe(true);
  });

  it('allows /pause for admin chat id', async () => {
    const req = {
      headers: { get: () => 'test_bot_token' },
      text: async () => JSON.stringify({ message: { text: '/pause', chat: { id: 12345 } } }) // matches admin ID
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Cinder Trading Kill-Switch Triggered'));
    expect(global.tradingPaused).toBe(true);
  });

  it('subscribes user on /subscribe', async () => {
    const req = {
      headers: { get: () => 'test_bot_token' },
      text: async () => JSON.stringify({ message: { text: '/subscribe', chat: { id: 555 } } })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO telegram_subscriptions'),
      ['555']
    );
    expect(sendMessage).toHaveBeenCalledWith(555, expect.stringContaining('Subscription Active'));
  });

  it('links wallet address on /start with valid token', async () => {
    query.mockResolvedValueOnce([{ wallet_address: '0xabcde12345' }]);

    const req = {
      headers: { get: () => 'test_bot_token' },
      text: async () => JSON.stringify({ message: { text: '/start token_123', chat: { id: 555 } } })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT wallet_address FROM telegram_auth_tokens'),
      ['token_123']
    );
    // Only links created in the last 15 minutes are accepted
    expect(query.mock.calls[0][0]).toContain("created_at >= datetime('now', '-15 minutes')");
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO telegram_subscriptions'),
      ['555', '0xabcde12345']
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM telegram_auth_tokens'),
      ['token_123']
    );
    expect(sendMessage).toHaveBeenCalledWith(555, expect.stringContaining('Cinder Bot Activated'));
  });

  it('returns error on /start with invalid token', async () => {
    query.mockResolvedValueOnce([]); // no matching token

    const req = {
      headers: { get: () => 'test_bot_token' },
      text: async () => JSON.stringify({ message: { text: '/start invalid_token', chat: { id: 555 } } })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(555, expect.stringContaining('Invalid or Expired Connection Link'));
  });
});
