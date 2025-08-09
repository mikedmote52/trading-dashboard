-- Portfolio Brain Learning Tables

CREATE TABLE IF NOT EXISTS features_snapshot (
    id TEXT PRIMARY KEY,
    asof TEXT NOT NULL,
    symbol TEXT NOT NULL,
    short_interest_pct REAL,
    borrow_fee_7d_change REAL,
    rel_volume REAL,
    momentum_5d REAL,
    catalyst_flag INTEGER,
    float_shares INTEGER,
    UNIQUE(asof, symbol)
);

CREATE TABLE IF NOT EXISTS theses (
    id TEXT PRIMARY KEY,
    symbol TEXT UNIQUE NOT NULL,
    thesis_json TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS theses_history (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    thesis_json TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);