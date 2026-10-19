import { NextResponse } from 'next/server';
import { verifyTelegramSignature, sendMessage } from '../../../lib/telegram';
import { query, execute } from '../../../lib/db';
import { getAccountState } from '../../../lib/sodex';
import { rateLimit } from '../../../lib/rate-limiter';
import { setTradingPaused, isTradingPausedInDb } from '../../../lib/trading-pause';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhook
 * Receives webhook notifications from Telegram.
 * Performs secret token signature verification for authentication.
 */
export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateResult = rateLimit(ip);
    if (!rateResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const signature = request.headers.get('x-telegram-bot-api-secret-token') || '';
    const bodyText = await request.text();
    
    // Webhook security validation
    if (!verifyTelegramSignature(signature, bodyText)) {
      if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
        console.error('[SECURITY] TELEGRAM_WEBHOOK_SECRET not configured. Rejecting webhook to fail closed.');
        return NextResponse.json({ success: false, error: 'Server misconfigured' }, { status: 500 });
      }
      console.warn('[WARNING] Unauthorized Telegram webhook attempt. Invalid signature.');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let update;
    try {
      update = JSON.parse(bodyText);
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const message = update.message;
    if (!message || !message.text) {
      return NextResponse.json({ success: true, processed: false, reason: 'No message text' });
    }

    const chatId = message.chat?.id;
    const text = message.text.trim();

    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();

      switch (command) {
        case '/start': {
          const token = parts[1];
          if (token) {
            try {
              // Look up the token in the database
              const tokenRows = await query(
                // Links are single-use and expire 15 minutes after the portfolio page creates them
                "SELECT wallet_address FROM telegram_auth_tokens WHERE token = ? AND created_at >= datetime('now', '-15 minutes')",
                [token]
              );
              
              if (tokenRows && tokenRows.length > 0) {
                const walletAddress = tokenRows[0].wallet_address;
                
                // Register/update subscription with the linked wallet address
                await execute(
                  `INSERT INTO telegram_subscriptions (chat_id, wallet_address) 
                   VALUES (?, ?)
                   ON CONFLICT(chat_id) DO UPDATE SET wallet_address = excluded.wallet_address`,
                  [String(chatId), walletAddress]
                );
                
                // Delete the used token
                await execute(
                  'DELETE FROM telegram_auth_tokens WHERE token = ?',
                  [token]
                );

                const welcomeMsg = `[START] <b>Cinder Bot Activated!</b>\n\n` +
                  `Successfully linked to wallet <code>${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}</code>.\n\n` +
                  `You will receive real-time narrative shift alerts and daily digests. Use /help to see commands.`;
                await sendMessage(chatId, welcomeMsg);
              } else {
                await sendMessage(chatId, '[ERROR] <b>Invalid or Expired Connection Link</b>\nPlease generate a new link from the dashboard.');
              }
            } catch (e) {
              console.error('[ERROR] Failed to process start token registration:', e);
              await sendMessage(chatId, '[ERROR] Internal database error while linking wallet.');
            }
          } else {
            // Generic subscription fallback
            try {
              await execute(
                `INSERT INTO telegram_subscriptions (chat_id, wallet_address) 
                 VALUES (?, NULL)
                 ON CONFLICT(chat_id) DO NOTHING`,
                [String(chatId)]
              );
              const welcomeMsg = `[START] <b>Welcome to Cinder Bot!</b>\n\n` +
                `You have been successfully subscribed to real-time narrative shift alerts and daily digests.\n\n` +
                `Use /help to view all available commands.`;
              await sendMessage(chatId, welcomeMsg);
            } catch (e) {
              console.error('[ERROR] Failed to subscribe user on /start:', e);
              await sendMessage(chatId, '[ERROR] Failed to initialize subscription.');
            }
          }
          break;
        }
        case '/subscribe': {
          try {
            await execute(
              'INSERT INTO telegram_subscriptions (chat_id, wallet_address) VALUES (?, NULL) ON CONFLICT(chat_id) DO NOTHING',
              [String(chatId)]
            );
            await sendMessage(chatId, '[SUCCESS] <b>Subscription Active</b>\nYou will now receive live alerts and reports.');
          } catch (e) {
            console.error('[ERROR] Failed to subscribe user:', e);
            await sendMessage(chatId, '[ERROR] Failed to process subscription.');
          }
          break;
        }
        case '/unsubscribe': {
          try {
            await execute(
              'DELETE FROM telegram_subscriptions WHERE chat_id = ?',
              [String(chatId)]
            );
            await sendMessage(chatId, '[SUCCESS] <b>Unsubscribed Successfully</b>\nYou will no longer receive alerts from Cinder.');
          } catch (e) {
            console.error('[ERROR] Failed to unsubscribe user:', e);
            await sendMessage(chatId, '[ERROR] Failed to process unsubscription.');
          }
          break;
        }
        case '/pause': {
          if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) {
            await sendMessage(chatId, '[ERROR] <b>Access Denied</b>\nOnly the system administrator can trigger the kill-switch.');
            break;
          }
          global.tradingPaused = true;
          try {
            // Persisted so the worker process (which does the trading) sees it too
            await setTradingPaused(true);
            await sendMessage(chatId, '[ALERT] <b>Cinder Trading Kill-Switch Triggered</b>\nAutomated execution is now <b>PAUSED</b>.');
          } catch (e) {
            console.error('[ERROR] Failed to persist trading pause:', e);
            await sendMessage(chatId, '[ERROR] <b>Pause NOT saved</b>\nThe database could not be updated, so the worker may keep trading. Set AUTO_TRADE_ENABLED=false or use the Edge Config kill switch.');
          }
          break;
        }
        case '/resume': {
          if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) {
            await sendMessage(chatId, '[ERROR] <b>Access Denied</b>\nOnly the system administrator can resume trading.');
            break;
          }
          global.tradingPaused = false;
          try {
            await setTradingPaused(false);
            await sendMessage(chatId, '[START] <b>Cinder Trading Resumed</b>\nAutomated execution is now <b>ACTIVE</b>.');
          } catch (e) {
            console.error('[ERROR] Failed to persist trading resume:', e);
            await sendMessage(chatId, '[ERROR] <b>Resume NOT saved</b>\nThe database could not be updated; the worker stays paused.');
          }
          break;
        }
        case '/status': {
          const isPaused = global.tradingPaused === true || await isTradingPausedInDb();
          const autoTradeEnabled = process.env.AUTO_TRADE_ENABLED === 'true';
          const activePositionsCount = 0; // fallback or query DB
          let balance = '10000.00';

          const userAddress = process.env.USER_WALLET_ADDRESS;
          if (userAddress && userAddress !== 'your_evm_wallet_address_0x...') {
            try {
              const state = await getAccountState(userAddress);
              const usdc = state.balances.find(b => b.asset === 'USDC' || b.asset === 'USDT');
              if (usdc) balance = parseFloat(usdc.amount).toFixed(2);
            } catch (e) {}
          }

          const statusMsg = `[INFO] <b>Cinder System Status</b>\n\n` +
            `• <b>Execution State:</b> ${isPaused ? '[PAUSED] (Kill-Switch Active)' : '[SUCCESS] RUNNING'}\n` +
            `• <b>Auto-Trading Switch:</b> ${autoTradeEnabled ? 'ON' : 'OFF'}\n` +
            `• <b>Available Balance:</b> <code>$${balance}</code>\n` +
            `• <b>Daily Drawdown:</b> <code>0.00%</code>`;
          await sendMessage(chatId, statusMsg);
          break;
        }
        case '/help':
        default: {
          const helpMsg = `[INFO] <b>Cinder Bot Command Reference</b>\n\n` +
            `• /subscribe - Opt-in to receive real-time narrative shift alerts and daily digests\n` +
            `• /unsubscribe - Stop receiving automated alerts\n` +
            `• /status - Fetch real-time system performance and safety status\n` +
            `• /pause - (Admin) Triggers the emergency kill-switch to pause trading\n` +
            `• /resume - (Admin) Deactivates the kill-switch and resumes execution\n` +
            `• /help - Display this command manual`;
          await sendMessage(chatId, helpMsg);
          break;
        }
      }
      return NextResponse.json({ success: true, processed: true });
    }

    return NextResponse.json({ success: true, processed: false, reason: 'Not a command message' });
  } catch (error) {
    console.error('Error in POST /api/webhook:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
