-- Migration 0002: Add user_address column to trades table

-- Add user_address column if it doesn't exist
-- SQLite/Turso doesn't support IF NOT EXISTS for ALTER TABLE,
-- so we use a try/catch approach via the application layer.
ALTER TABLE trades ADD COLUMN user_address TEXT;

-- Index for per-user trade queries
CREATE INDEX IF NOT EXISTS idx_trades_user_address ON trades(user_address);
