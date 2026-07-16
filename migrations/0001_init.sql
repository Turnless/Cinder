-- Initial Schema Migration for AlphaWire (Turso/libSQL compatible)

-- Published stories
CREATE TABLE IF NOT EXISTS stories (
    id              TEXT PRIMARY KEY,         -- UUID
    type            TEXT NOT NULL,            -- 'pulse', 'deep_dive', 'breaking'
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,            -- Markdown content
    summary         TEXT,                     -- One-line summary
    chart_data      TEXT,                     -- JSON: chart configurations
    narrative_state TEXT,                     -- JSON: narrative temps at publish time
    published_at    DATETIME NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Narrative temperature history
CREATE TABLE IF NOT EXISTS narrative_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    narrative_id    TEXT NOT NULL,            -- e.g., 'NAR_01'
    temperature     REAL NOT NULL,            -- 0.0 to 100.0
    news_score      REAL,
    flow_score      REAL,
    sector_score    REAL,
    recorded_at     DATETIME NOT NULL
);

-- Detected narrative shifts
CREATE TABLE IF NOT EXISTS narrative_shifts (
    id              TEXT PRIMARY KEY,         -- UUID
    from_narrative  TEXT NOT NULL,
    to_narrative    TEXT NOT NULL,
    confidence      REAL NOT NULL,            -- 0.0 to 100.0
    signals         TEXT NOT NULL,            -- JSON: evidence array
    story_id        TEXT REFERENCES stories(id),
    trade_id        TEXT REFERENCES trades(id),
    detected_at     DATETIME NOT NULL
);

-- Executed trades
CREATE TABLE IF NOT EXISTS trades (
    id              TEXT PRIMARY KEY,         -- UUID
    shift_id        TEXT REFERENCES narrative_shifts(id),
    story_id        TEXT REFERENCES stories(id),
    user_address    TEXT,                     -- Wallet address of the user who initiated the trade
    side            TEXT NOT NULL,            -- 'buy' or 'sell'
    pair            TEXT NOT NULL,            -- e.g., 'BTC-USDC'
    order_type      TEXT NOT NULL,            -- 'market' or 'limit'
    quantity        TEXT NOT NULL,            -- Decimal string
    fill_price      TEXT,                     -- Decimal string (after fill)
    stop_loss_price TEXT,                     -- Decimal string
    sodex_order_id  TEXT,                     -- SoDEX order reference
    status          TEXT NOT NULL,            -- 'pending', 'filled', 'cancelled', 'stopped'
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    filled_at       DATETIME,
    closed_at       DATETIME
);

-- Cached SoSoValue data
CREATE TABLE IF NOT EXISTS etf_flows (
    id              TEXT PRIMARY KEY,
    asset           TEXT NOT NULL,
    date            TEXT NOT NULL,
    net_flow        REAL NOT NULL,
    total_net_assets REAL,
    details         TEXT,                     -- JSON: per-fund breakdown
    fetched_at      DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS news_items (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    summary         TEXT,
    source          TEXT,
    keywords        TEXT,                     -- JSON: extracted keywords
    sentiment       REAL,                     -- -1.0 to 1.0
    fetched_at      DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS sector_data (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sector          TEXT NOT NULL,
    performance_7d  REAL,
    performance_30d REAL,
    correlation_btc REAL,
    constituents    TEXT,                     -- JSON: token list
    fetched_at      DATETIME NOT NULL
);

-- Wallet balances for CNDR faucet linking
CREATE TABLE IF NOT EXISTS wallet_balances (
    address         TEXT PRIMARY KEY,
    balance         TEXT NOT NULL,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stories_type ON stories(type);
CREATE INDEX IF NOT EXISTS idx_stories_published ON stories(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_history_time ON narrative_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_history_id ON narrative_history(narrative_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_etf_flows_date ON etf_flows(asset, date);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_address ON wallet_balances(address);

-- Telegram alerts subscriptions
CREATE TABLE IF NOT EXISTS telegram_subscriptions (
    chat_id         TEXT PRIMARY KEY,
    wallet_address  TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Telegram wallet authentication tokens
CREATE TABLE IF NOT EXISTS telegram_auth_tokens (
    token           TEXT PRIMARY KEY,
    wallet_address  TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
