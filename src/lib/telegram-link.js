/**
 * Message a wallet signs to prove ownership before linking Telegram alerts.
 * Shared by the portfolio page (signing) and /api/telegram-auth (verifying), so it must
 * stay free of server-only imports.
 * @param {string} address - Wallet address being linked
 * @param {string} issuedAt - ISO timestamp chosen by the client
 * @returns {string} Exact message text to sign
 */
export function buildTelegramLinkMessage(address, issuedAt) {
  return `Link Telegram alerts to Cinder\nWallet: ${address.toLowerCase()}\nIssued at: ${issuedAt}`;
}

// How long a signed link request stays valid
export const TELEGRAM_LINK_MAX_AGE_MS = 5 * 60 * 1000;
