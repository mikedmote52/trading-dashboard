PRAGMA foreign_keys=ON;

-- Clean up and recreate with proper schema
DROP TABLE IF EXISTS vigl_discoveries;
CREATE TABLE discoveries (
  id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  symbol TEXT,
  score REAL,
  features_json TEXT
);

DROP TABLE IF EXISTS features_snapshots;
CREATE TABLE features_snapshot (
  id TEXT PRIMARY KEY,
  asof TEXT,
  symbol TEXT,
  short_interest_pct REAL,
  borrow_fee_7d_change REAL,
  rel_volume REAL,
  momentum_5d REAL,
  catalyst_flag INTEGER,
  float_shares INTEGER
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  ts INTEGER,
  kind TEXT,
  symbol TEXT,
  recommendation TEXT,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS thesis (
  symbol TEXT PRIMARY KEY,
  version INTEGER,
  payload_json TEXT,
  updated_at TEXT
);

-- Thesis events table for learning loop
CREATE TABLE IF NOT EXISTS thesis_events (
  id TEXT PRIMARY KEY,
  symbol TEXT,
  event_type TEXT,
  event_data TEXT,
  created_at TEXT,
  FOREIGN KEY (symbol) REFERENCES thesis(symbol)
);

-- AlphaStack screener tables
CREATE TABLE IF NOT EXISTS screener_candidates (
  id TEXT PRIMARY KEY,
  symbol TEXT,
  score REAL,
  bucket TEXT,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS technical_metrics (
  symbol TEXT PRIMARY KEY,
  price REAL,
  volume INTEGER,
  rel_vol_30m REAL,
  vwap REAL,
  rsi REAL,
  atr_frac REAL,
  momentum_5d REAL,
  momentum_21d REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS short_metrics (
  symbol TEXT PRIMARY KEY,
  float_shares INTEGER,
  short_interest REAL,
  borrow_fee REAL,
  days_to_cover REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS options_metrics (
  symbol TEXT PRIMARY KEY,
  call_put_ratio REAL,
  iv_rank REAL,
  option_volume INTEGER,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sentiment_metrics (
  symbol TEXT PRIMARY KEY,
  reddit_mentions INTEGER,
  sentiment_score REAL,
  news_volume INTEGER,
  social_volume INTEGER,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_discoveries_symbol ON discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_discoveries_score ON discoveries(score);
CREATE INDEX IF NOT EXISTS idx_features_symbol ON features_snapshot(symbol);
CREATE INDEX IF NOT EXISTS idx_features_asof ON features_snapshot(asof);