/**
 * Trading pause flag stored in the database, so a /pause sent to the website's Telegram webhook
 * also stops the worker process that actually trades (an in-memory flag only affects one process).
 */

import { query, execute } from './db.js';

/**
 * @param {boolean} paused - New state
 * @returns {Promise<void>}
 */
export async function setTradingPaused(paused) {
  await execute(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('trading_paused', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [paused ? 'true' : 'false']
  );
}

/**
 * @returns {Promise<boolean>} True if trading was paused via /pause. A database error reads as
 *   "not paused": trading itself needs the database, and Edge Config remains the fail-closed switch.
 */
export async function isTradingPausedInDb() {
  try {
    const rows = await query("SELECT value FROM app_settings WHERE key = 'trading_paused'");
    return rows?.[0]?.value === 'true';
  } catch (err) {
    console.warn('[KILL-SWITCH] Could not read trading_paused from the database:', err.message);
    return false;
  }
}
