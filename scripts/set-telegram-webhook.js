#!/usr/bin/env node
/**
 * Register Telegram webhook with the production URL.
 * Usage: node scripts/set-telegram-webhook.js
 *
 * Requires env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
 * Production URL: https://cinderhq.vercel.app/api/webhook
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const WEBHOOK_URL = 'https://cinderhq.vercel.app/api/webhook';

if (!BOT_TOKEN || BOT_TOKEN === 'your_telegram_bot_token') {
  console.error('ERROR: Set TELEGRAM_BOT_TOKEN in your .env or environment');
  process.exit(1);
}

if (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'your_webhook_secret') {
  console.error('ERROR: Set TELEGRAM_WEBHOOK_SECRET in your .env or environment');
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

async function setWebhook() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
  
  const body = {
    url: WEBHOOK_URL,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  };

  console.log(`Setting webhook to: ${WEBHOOK_URL}`);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  
  if (data.ok) {
    console.log('Webhook set successfully!');
    console.log('Response:', JSON.stringify(data.result, null, 2));
  } else {
    console.error('Failed to set webhook:', data.description);
    process.exit(1);
  }
}

async function getWebhookInfo() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.ok) {
    console.log('\nCurrent webhook info:');
    console.log(JSON.stringify(data.result, null, 2));
  }
}

(async () => {
  await setWebhook();
  await getWebhookInfo();
})();
