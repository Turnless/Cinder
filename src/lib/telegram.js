/**
 * Telegram Bot API Client.
 * Handles sending alerts, digests, and webhook notifications.
 */

import { NARRATIVES } from '../engine/narrative.js';
import { query } from './db.js';

/**
 * Sends a raw text message to a specific Telegram chat or broadcasts to all subscribers.
 * @param {string} [chatId] - Target Telegram chat/channel ID (if empty, broadcasts to admin and all subscribers)
 * @param {string} text - Message content
 * @returns {Promise<boolean>} Success status
 */
export async function sendMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[WARNING] Telegram Bot Token is missing from environment variables.");
    return false;
  }

  // If a specific chatId is provided, send to that chat ID only
  if (chatId) {
    return await sendRawMessage(chatId, token, text);
  }

  // Otherwise, broadcast to admin and all subscribers
  const adminChatId = process.env.TELEGRAM_CHAT_ID;
  const targets = new Set();
  if (adminChatId) {
    targets.add(String(adminChatId));
  }

  try {
    const rows = await query('SELECT chat_id FROM telegram_subscriptions');
    if (rows && rows.length > 0) {
      rows.forEach(row => {
        if (row.chat_id) {
          targets.add(String(row.chat_id));
        }
      });
    }
  } catch (err) {
    console.error('[ERROR] Failed to query Telegram subscriptions:', err);
  }

  if (targets.size === 0) {
    console.warn("[WARNING] No targets (admin or subscribers) found for Telegram alert.");
    return false;
  }

  let allSuccess = true;
  for (const targetId of targets) {
    const ok = await sendRawMessage(targetId, token, text);
    if (!ok) allSuccess = false;
  }
  return allSuccess;
}

/**
 * Helper to post message directly to Telegram Bot API.
 */
async function sendRawMessage(targetChatId, token, text) {
  if (token === 'your_telegram_bot_token' || targetChatId === 'your_chat_id') {
    console.log(`[INFO] Telegram bot is running in dry-run/stub mode for chat ID ${targetChatId}.`);
    return true;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: text,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`[ERROR] Telegram API returned an error for chat ${targetChatId}:`, data.description);
    }
    return data.ok === true;
  } catch (error) {
    console.error(`[ERROR] Error sending Telegram message to ${targetChatId}:`, error);
    return false;
  }
}

/**
 * Sends a formatted narrative regime shift alert card.
 * @param {Object} shiftData - Detail of the narrative shift and confidence
 * @returns {Promise<boolean>} Success status
 */
export async function sendNarrativeAlert(shiftData) {
  if (!shiftData) return false;

  const fromName = NARRATIVES[shiftData.from_narrative]?.name || shiftData.from_narrative || 'Unknown';
  const toName = NARRATIVES[shiftData.to_narrative]?.name || shiftData.to_narrative || 'Unknown';
  const confidence = shiftData.confidence ? parseFloat(shiftData.confidence).toFixed(1) : '0.0';

  let signalsList = '';
  if (shiftData.signals) {
    try {
      const parsed = typeof shiftData.signals === 'string' ? JSON.parse(shiftData.signals) : shiftData.signals;
      if (Array.isArray(parsed)) {
        signalsList = parsed.map(s => `• ${s}`).join('\n');
      } else {
        signalsList = `• ${parsed}`;
      }
    } catch (e) {
      signalsList = `• ${shiftData.signals}`;
    }
  }

  const text = `[ALERT] <b>[Cinder Alert] Narrative Regime Shift Detected</b>\n\n` +
    `<b>From:</b> ${fromName} (${shiftData.from_narrative || 'N/A'})\n` +
    `<b>To:</b> ${toName} (${shiftData.to_narrative || 'N/A'})\n` +
    `<b>Confidence:</b> ${confidence}%\n\n` +
    `<b>Aligned Signals:</b>\n${signalsList || 'None'}\n\n` +
    `<i>Detected at: ${new Date(shiftData.detected_at || Date.now()).toISOString()}</i>`;

  return sendMessage(null, text);
}

/**
 * Sends a daily performance and status digest.
 * @param {Object} portfolioSummary - Key details of positions and returns
 * @returns {Promise<boolean>} Success status
 */
export async function sendDailyDigest(portfolioSummary) {
  if (!portfolioSummary) return false;

  const balance = portfolioSummary.balance || '0.00';
  const pnl = portfolioSummary.dailyReturn || '0.0%';
  const tradesCount = portfolioSummary.dailyTradesCount || 0;
  const circuitBreaker = portfolioSummary.circuitBreakerStatus || 'NOMINAL';
  const autoTrade = portfolioSummary.autoTradeEnabled ? 'ACTIVE' : 'DISABLED';
  const stopLossesCount = portfolioSummary.activeStopLossesCount || 0;

  let positionsStr = '';
  if (portfolioSummary.positions && portfolioSummary.positions.length > 0) {
    positionsStr = portfolioSummary.positions.map(pos => {
      const entry = pos.entryPrice ? parseFloat(pos.entryPrice).toFixed(2) : '0.00';
      const cur = pos.currentPrice ? parseFloat(pos.currentPrice).toFixed(2) : '0.00';
      const val = pos.value ? parseFloat(pos.value).toFixed(2) : '0.00';
      const sl = pos.stopLoss ? parseFloat(pos.stopLoss).toFixed(2) : 'N/A';
      const ret = pos.return ? `${parseFloat(pos.return) >= 0 ? '+' : ''}${parseFloat(pos.return).toFixed(2)}%` : '0.00%';
      return `• <b>${pos.asset}</b>\n  Qty: <code>${pos.quantity}</code>\n  Entry: <code>$${entry}</code>\n  Value: <code>$${val}</code>\n  Stop Loss: <code>$${sl}</code>\n  PNL: <code>${ret}</code>`;
    }).join('\n\n');
  } else {
    positionsStr = '<i>No active positions.</i>';
  }

  const text = `[STATS] <b>[Cinder Daily Digest] Portfolio & Risk Status</b>\n\n` +
    `<b>Portfolio Summary:</b>\n` +
    `• Total Balance: <code>$${balance}</code>\n` +
    `• Daily Performance: <code>${pnl}</code>\n` +
    `• Executed Trades (24h): <code>${tradesCount}</code>\n\n` +
    `[PORTFOLIO] <b>Open Positions:</b>\n${positionsStr}\n\n` +
    `[RISK] <b>Risk Status:</b>\n` +
    `• Stop-Losses Active: <code>${stopLossesCount}</code>\n` +
    `• Daily Loss Limit: <code>${circuitBreaker}</code>\n` +
    `• Auto-Trading Switch: <code>${autoTrade}</code>\n\n` +
    `<i>Generated at: ${new Date().toISOString()}</i>`;

  return sendMessage(null, text);
}

/**
 * Validates the signature header from Telegram webhooks.
 * @param {string} signature - Telegram webhook signature token/hash
 * @param {string} body - Request body payload string
 * @returns {boolean} True if the request is verified as authentic
 */
export function verifyTelegramSignature(signature, body) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // Fallback to bot token if no dedicated secret is set
    const token = process.env.TELEGRAM_BOT_TOKEN;
    return signature === token;
  }
  return signature === secret;
}
