-- Migration 0003: Replay protection for signed trades and CNDR payments

-- Each (wallet, nonce) pair may be used for one signed order only
CREATE TABLE IF NOT EXISTS trade_nonces (
    wallet_address  TEXT NOT NULL,
    nonce           TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (wallet_address, nonce)
);

-- Each CNDR payment transaction may pay for one BUY order only
CREATE TABLE IF NOT EXISTS cndr_payments (
    tx_hash         TEXT PRIMARY KEY,
    wallet_address  TEXT NOT NULL,
    pair            TEXT,
    amount          TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
