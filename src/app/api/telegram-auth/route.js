import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { execute, query } from '../../../lib/db';
import { rateLimit } from '../../../lib/rate-limiter';
import { buildTelegramLinkMessage, TELEGRAM_LINK_MAX_AGE_MS } from '../../../lib/telegram-link';

export const dynamic = 'force-dynamic';

/**
 * GET /api/telegram-auth?address=0x...
 * Check if a wallet address has an active Telegram subscription.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address || !address.startsWith('0x')) {
      return NextResponse.json({ success: false, connected: false });
    }

    const rows = await query(
      'SELECT chat_id FROM telegram_subscriptions WHERE wallet_address = ?',
      [address.toLowerCase()]
    );

    return NextResponse.json({
      success: true,
      connected: rows && rows.length > 0,
    });
  } catch (error) {
    return NextResponse.json({ success: true, connected: false });
  }
}

/**
 * POST /api/telegram-auth
 * Generates a short-lived unique auth token linked to an EVM wallet address.
 * The caller must prove it controls the wallet by signing buildTelegramLinkMessage().
 * Returns the Telegram Bot deep-link to trigger connection via Telegram '/start <token>'.
 */
export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateResult = rateLimit(ip, 10);
    if (!rateResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const { address, signature, issuedAt } = body;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: 'Invalid EVM wallet address' }, { status: 400 });
    }

    // Proof of wallet ownership: a fresh personal_sign over the link message
    const issuedMs = Date.parse(issuedAt);
    if (!signature || Number.isNaN(issuedMs) || Math.abs(Date.now() - issuedMs) > TELEGRAM_LINK_MAX_AGE_MS) {
      return NextResponse.json({ success: false, error: 'A fresh wallet signature is required to link Telegram' }, { status: 401 });
    }
    let recovered;
    try {
      recovered = ethers.utils.verifyMessage(buildTelegramLinkMessage(address, issuedAt), signature);
    } catch {
      recovered = null;
    }
    if (!recovered || recovered.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Wallet signature does not match the address' }, { status: 401 });
    }

    // Generate a secure random alphanumeric token
    const token = crypto.randomBytes(8).toString('hex');

    // Store in database
    await execute(
      'INSERT INTO telegram_auth_tokens (token, wallet_address) VALUES (?, ?)',
      [token, address.toLowerCase()]
    );

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    let botUsername = process.env.TELEGRAM_BOT_USERNAME || 'cinder_wire_bot';

    if (botToken && botToken !== 'your_telegram_bot_token') {
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.result?.username) {
            botUsername = data.result.username;
          }
        }
      } catch (err) {
        console.error('Failed to resolve bot username dynamically:', err);
      }
    }

    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    return NextResponse.json({
      success: true,
      token,
      deepLink
    });
  } catch (error) {
    console.error('Error generating Telegram auth token:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
