const Database = require('better-sqlite3');
const path = require('path');

// Initialize database with configurable path for cloud deployment
const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../trading_dashboard.db');
console.log(`📊 SQLite database path: ${dbPath}`);
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
const initSchema = `
CREATE TABLE IF NOT EXISTS features_snapshots (
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

CREATE TABLE IF NOT EXISTS vigl_discoveries (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  company_name TEXT,
  current_price REAL,
  market_cap REAL,
  volume_spike_ratio REAL,
  momentum REAL,
  pattern_strength REAL,
  sector TEXT,
  catalysts TEXT,
  vigl_similarity REAL,
  confidence_score REAL,
  is_high_confidence BOOLEAN,
  estimated_upside TEXT,
  risk_level TEXT,
  recommendation TEXT,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scan_session_id TEXT
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
  FOREIGN KEY (features_id) REFERENCES features_snapshots(id)
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

CREATE INDEX IF NOT EXISTS idx_features_symbol ON features_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_features_asof ON features_snapshots(asof);
CREATE INDEX IF NOT EXISTS idx_discoveries_symbol ON vigl_discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_discoveries_date ON vigl_discoveries(discovered_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON trading_decisions(symbol);
`;

// Run schema initialization - safe with CREATE IF NOT EXISTS
try {
  db.exec(initSchema);
  console.log('✅ SQLite schema verified/created');
} catch (error) {
  console.log('⚠️ Schema initialization:', error.message);
}

// Prepared statements for features
const insertFeaturesSnapshot = db.prepare(`
  INSERT OR REPLACE INTO features_snapshot 
  (id, asof, symbol, short_interest_pct, borrow_fee_7d_change, rel_volume, 
   momentum_5d, catalyst_flag, float_shares)
  VALUES (@id, @asof, @symbol, @short_interest_pct, @borrow_fee_7d_change, 
          @rel_volume, @momentum_5d, @catalyst_flag, @float_shares)
`);

const getLatestFeatures = db.prepare(`
  SELECT * FROM features_snapshot 
  WHERE symbol = ? 
  ORDER BY asof DESC 
  LIMIT 1
`);

// Prepared statements for discoveries
const upsertDiscovery = db.prepare(`
  INSERT OR REPLACE INTO discoveries 
  (id, symbol, score, features_json)
  VALUES (@id, @symbol, @score, @features_json)
`);

const getTodaysDiscoveries = () => {
  const today = new Date().toISOString().split('T')[0];
  const stmt = db.prepare(`
    SELECT * FROM discoveries 
    WHERE DATE(created_at) = DATE(?)
    ORDER BY score DESC
  `);
  return stmt.all(today);
};

const getLatestDiscoveries = (limit = 10) => {
  const stmt = db.prepare(`
    SELECT * FROM discoveries 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit);
};

// Prepared statements for theses
const getThesis = db.prepare(`
  SELECT * FROM theses WHERE symbol = ?
`);

const upsertThesis = db.prepare(`
  INSERT OR REPLACE INTO theses 
  (symbol, current_thesis, target_prices, entry_price, timeline, confidence_score)
  VALUES (@symbol, @current_thesis, @target_prices, @entry_price, @timeline, @confidence_score)
`);

const insertThesisHistory = db.prepare(`
  INSERT INTO thesis_history (id, symbol, thesis, reasoning)
  VALUES (@id, @symbol, @thesis, @reasoning)
`);

// Prepared statements for decisions
const insertDecision = db.prepare(`
  INSERT INTO trading_decisions (id, symbol, action, confidence, features_id)
  VALUES (@id, @symbol, @action, @confidence, @features_id)
`);

const getLatestDecision = db.prepare(`
  SELECT * FROM trading_decisions 
  WHERE symbol = ? 
  ORDER BY created_at DESC 
  LIMIT 1
`);

// Prepared statements for scoring weights
const getScoringWeights = db.prepare(`
  SELECT * FROM scoring_weights 
  WHERE is_active = 1 
  ORDER BY created_at DESC 
  LIMIT 1
`);

const upsertScoringWeights = db.prepare(`
  INSERT OR REPLACE INTO scoring_weights 
  (id, weight_short_interest, weight_borrow_fee, weight_volume, 
   weight_momentum, weight_catalyst, is_active)
  VALUES (@id, @weight_short_interest, @weight_borrow_fee, @weight_volume, 
          @weight_momentum, @weight_catalyst, @is_active)
`);

// Initialize default scoring weights if none exist
const defaultWeights = getScoringWeights.get();
if (!defaultWeights) {
  const { v4: uuidv4 } = require('uuid');
  upsertScoringWeights.run({
    id: uuidv4(),
    weight_short_interest: 0.35,
    weight_borrow_fee: 0.25,
    weight_volume: 0.2,
    weight_momentum: 0.15,
    weight_catalyst: 0.05,
    is_active: 1
  });
  console.log('✅ Initialized default scoring weights');
}

module.exports = {
  db,
  insertFeaturesSnapshot,
  getLatestFeatures,
  upsertDiscovery,
  getTodaysDiscoveries,
  getLatestDiscoveries,
  getThesis,
  upsertThesis,
  insertThesisHistory,
  insertDecision,
  getLatestDecision,
  getScoringWeights,
  upsertScoringWeights
};