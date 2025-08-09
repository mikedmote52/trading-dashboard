const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, "..", "trading_dashboard.db");

// Ensure directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

// Schema matching the existing server/db/sqlite.js expectations
db.exec(`
CREATE TABLE IF NOT EXISTS features_snapshot (
  id TEXT PRIMARY KEY,
  asof DATE NOT NULL,
  symbol TEXT NOT NULL,
  short_interest_pct REAL,
  borrow_fee_7d_change REAL,
  rel_volume REAL,
  momentum_5d REAL,
  catalyst_flag INTEGER DEFAULT 0,
  float_shares INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, asof)
);

CREATE TABLE IF NOT EXISTS discoveries (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  score REAL NOT NULL,
  features_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS theses (
  symbol TEXT PRIMARY KEY,
  current_thesis TEXT,
  target_prices TEXT,
  entry_price REAL,
  timeline TEXT,
  confidence_score REAL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS thesis_history (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  thesis TEXT,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (symbol) REFERENCES theses(symbol)
);

CREATE TABLE IF NOT EXISTS trading_decisions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL,
  features_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (features_id) REFERENCES features_snapshot(id)
);

CREATE TABLE IF NOT EXISTS scoring_weights (
  id TEXT PRIMARY KEY,
  weight_short_interest REAL DEFAULT 0.35,
  weight_borrow_fee REAL DEFAULT 0.25,
  weight_volume REAL DEFAULT 0.2,
  weight_momentum REAL DEFAULT 0.15,
  weight_catalyst REAL DEFAULT 0.05,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_features_symbol ON features_snapshot(symbol);
CREATE INDEX IF NOT EXISTS idx_features_asof ON features_snapshot(asof);
CREATE INDEX IF NOT EXISTS idx_discoveries_symbol ON discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_discoveries_date ON discoveries(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON trading_decisions(symbol);
`);

console.log("✅ SQLite initialized at", dbPath);
db.close();