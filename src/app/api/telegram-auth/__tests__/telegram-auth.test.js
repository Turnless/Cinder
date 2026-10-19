import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { POST } from '../route.js';
import { execute } from '../../../../lib/db.js';
import { rateLimit } from '../../../../lib/rate-limiter.js';
import { buildTelegramLinkMessage } from '../../../../lib/telegram-link.js';

vi.mock('../../../../lib/db.js', () => ({
  execute: vi.fn(),
  query: vi.fn()
}));

vi.mock('../../../../lib/rate-limiter.js', () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true })
}));

function makeRequest(body) {
  return new Request('http://localhost/api/telegram-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
    body: JSON.stringify(body)
  });
}

async function signedLinkBody(wallet, issuedAt = new Date().toISOString()) {
  const signature = await wallet.signMessage(buildTelegramLinkMessage(wallet.address, issuedAt));
  return { address: wallet.address, signature, issuedAt };
}

describe('POST /api/telegram-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.mockReturnValue({ success: true });
    process.env.TELEGRAM_BOT_USERNAME = 'cinder_wire_bot';
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it('fails if address is missing or invalid', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid EVM wallet address');
  });

  it('rejects an address without a wallet signature', async () => {
    const res = await POST(makeRequest({ address: '0x1234567890123456789012345678901234567890' }));
    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a signature from a different wallet (linking someone else's address)", async () => {
    const attacker = ethers.Wallet.createRandom();
    const victim = ethers.Wallet.createRandom();
    const issuedAt = new Date().toISOString();
    const signature = await attacker.signMessage(buildTelegramLinkMessage(victim.address, issuedAt));

    const res = await POST(makeRequest({ address: victim.address, signature, issuedAt }));
    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a signature older than 5 minutes', async () => {
    const wallet = ethers.Wallet.createRandom();
    const body = await signedLinkBody(wallet, new Date(Date.now() - 6 * 60 * 1000).toISOString());

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
  });

  it('is rate limited', async () => {
    rateLimit.mockReturnValue({ success: false });
    const wallet = ethers.Wallet.createRandom();

    const res = await POST(makeRequest(await signedLinkBody(wallet)));
    expect(res.status).toBe(429);
  });

  it('generates a token and returns deep link for a correctly signed request', async () => {
    const wallet = ethers.Wallet.createRandom();

    const res = await POST(makeRequest(await signedLinkBody(wallet)));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.deepLink).toContain('https://t.me/cinder_wire_bot?start=');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO telegram_auth_tokens'),
      [data.token, wallet.address.toLowerCase()]
    );
  });
});
