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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_discoveries_symbol ON discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_discoveries_score ON discoveries(score);
CREATE INDEX IF NOT EXISTS idx_features_symbol ON features_snapshot(symbol);
CREATE INDEX IF NOT EXISTS idx_features_asof ON features_snapshot(asof);