const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'trading_dashboard.db');

// Read just the AlphaStack tables from schema.sql
const alphaStackSQL = `
-- AlphaStack tables
CREATE TABLE IF NOT EXISTS short_metrics (
  symbol TEXT PRIMARY KEY,
  float_shares REAL,
  short_interest REAL,
  borrow_fee REAL,
  utilization REAL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS options_metrics (
  symbol TEXT PRIMARY KEY,
  call_put_ratio REAL,
  near_atm_call_oi_change REAL,
  iv_percentile INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sentiment_metrics (
  symbol TEXT PRIMARY KEY,
  reddit_mentions INTEGER,
  stocktwits_msgs INTEGER,
  youtube_trend INTEGER,
  sentiment_score REAL,   -- -1..1
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS technical_metrics (
  symbol TEXT PRIMARY KEY,
  rsi REAL,
  atr_frac REAL,
  ema9 REAL,
  ema20 REAL,
  vwap REAL,
  price REAL,
  rel_vol_30m REAL,
  multi_day_up BOOLEAN,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalysts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  catalyst_type TEXT,   -- earnings|fda|insider|mna|social_top10|other
  headline TEXT,
  url TEXT,
  happened_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screener_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  score INTEGER,
  bucket TEXT,          -- watch|trade-ready
  reason TEXT,
  run_label TEXT,       -- premarket|midday|powerhour
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_screener_candidates_score ON screener_candidates(score);
CREATE INDEX IF NOT EXISTS idx_screener_candidates_run ON screener_candidates(run_label);
CREATE INDEX IF NOT EXISTS idx_screener_candidates_created ON screener_candidates(created_at);
`;

const db = new sqlite3.Database(DB_PATH);
db.exec(alphaStackSQL, (err) => {
  if (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } else {
    console.log('AlphaStack migration complete at', DB_PATH);
    process.exit(0);
  }
});