-- Migration 0004: Shared settings visible to every process (website and worker)

-- trading_paused: set by the Telegram /pause and /resume commands, read by the trade engine
CREATE TABLE IF NOT EXISTS app_settings (
    key             TEXT PRIMARY KEY,
    value           TEXT,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
