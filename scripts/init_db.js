#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Database path with Render cloud compatibility
const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'trading_dashboard.db');

console.log('🗄️  Initializing SQLite database at:', dbPath);

// Ensure parent directory exists
const dbDir = path.dirname(dbPath);
console.log('📁 Ensuring directory exists:', dbDir);
fs.mkdirSync(dbDir, { recursive: true });

// Initialize database connection
const db = new Database(dbPath);

// Set optimal SQLite pragmas
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// Complete schema matching server/db/sqlite.js expectations
const schema = `
-- Features snapshot table (note: code uses singular 'features_snapshot')
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

-- Discoveries table (note: code uses singular 'discoveries')
CREATE TABLE IF NOT EXISTS discoveries (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  score REAL NOT NULL,
  features_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VIGL discoveries (legacy table, kept for compatibility)
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

-- Portfolio decisions
CREATE TABLE IF NOT EXISTS portfolio_decisions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL,
  score REAL,
  reason TEXT,
  explanation TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Theses management
CREATE TABLE IF NOT EXISTS theses (
  symbol TEXT PRIMARY KEY,
  current_thesis TEXT,
  target_prices TEXT,
  entry_price REAL,
  timeline TEXT,
  confidence_score REAL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Thesis history
CREATE TABLE IF NOT EXISTS thesis_history (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  thesis TEXT,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (symbol) REFERENCES theses(symbol)
);

-- Trading decisions
CREATE TABLE IF NOT EXISTS trading_decisions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL,
  features_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (features_id) REFERENCES features_snapshot(id)
);

-- Scoring weights
CREATE TABLE IF NOT EXISTS scoring_weights (
  id TEXT PRIMARY KEY,
  weight_short_interest REAL DEFAULT 2.0,
  weight_borrow_fee REAL DEFAULT 1.5,
  weight_volume REAL DEFAULT 1.2,
  weight_momentum REAL DEFAULT 1.0,
  weight_catalyst REAL DEFAULT 0.8,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_features_symbol ON features_snapshot(symbol);
CREATE INDEX IF NOT EXISTS idx_features_asof ON features_snapshot(asof);
CREATE INDEX IF NOT EXISTS idx_discoveries_symbol ON discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_discoveries_created ON discoveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vigl_discoveries_symbol ON vigl_discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_vigl_discoveries_date ON vigl_discoveries(discovered_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON trading_decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_decisions_symbol ON portfolio_decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_decisions_created ON portfolio_decisions(created_at DESC);
`;

// Execute schema
console.log('🔧 Creating tables and indexes...');
db.exec(schema);

// Verify all tables exist
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
const tableNames = tables.map(t => t.name);

console.log('✅ Database tables verified:');
tableNames.forEach(name => console.log(`   - ${name}`));

// Initialize default scoring weights if none exist
const weightCount = db.prepare("SELECT COUNT(*) as count FROM scoring_weights WHERE is_active = 1").get();
if (weightCount.count === 0) {
  const { v4: uuidv4 } = require('uuid');
  const insertWeight = db.prepare(`
    INSERT INTO scoring_weights (id, weight_short_interest, weight_borrow_fee, weight_volume, weight_momentum, weight_catalyst, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertWeight.run(
    uuidv4(),
    2.0,  // short_interest_weight
    1.5,  // borrow_fee_weight  
    1.2,  // volume_weight
    1.0,  // momentum_weight
    0.8,  // catalyst_weight
    1     // is_active
  );
  
  console.log('✅ Default scoring weights initialized');
}

// Clean up
db.close();

console.log('🎯 DB MIGRATIONS APPLIED');
console.log('📊 Database ready at:', dbPath);