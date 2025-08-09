#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Synchronous schema creation - guarantees all tables exist before any queries
 */
function ensureSchema(dbPath) {
  console.log('🗄️  Ensuring SQLite schema at:', dbPath);
  
  // Ensure parent directory exists
  const dbDir = path.dirname(dbPath);
  fs.mkdirSync(dbDir, { recursive: true });
  
  // Initialize database connection
  const db = new Database(dbPath);
  
  // Set optimal SQLite pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  
  // Complete schema - all tables and indexes the app expects
  const schema = `
-- Features snapshot table (critical: code uses singular 'features_snapshot')
CREATE TABLE IF NOT EXISTS features_snapshot (
  symbol TEXT NOT NULL,
  asof TEXT NOT NULL,
  rel_volume REAL,
  momentum_5d REAL,
  short_interest_pct REAL DEFAULT 0,
  borrow_fee_7d_change REAL DEFAULT 0,
  catalyst_flag INTEGER DEFAULT 0,
  float_shares INTEGER DEFAULT 50000000,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(symbol, asof)
);

-- Discoveries table (code uses singular 'discoveries')
CREATE TABLE IF NOT EXISTS discoveries (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  score REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  features_json TEXT NOT NULL
);

-- Scoring weights table
CREATE TABLE IF NOT EXISTS scoring_weights (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Trading decisions
CREATE TABLE IF NOT EXISTS trading_decisions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL,
  features_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
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
  created_at TEXT DEFAULT (datetime('now'))
);

-- Generic decisions table (for compatibility)
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence REAL,
  score REAL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- VIGL discoveries (legacy compatibility)
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
  discovered_at TEXT DEFAULT (datetime('now')),
  scan_session_id TEXT
);

-- Theses management
CREATE TABLE IF NOT EXISTS theses (
  symbol TEXT PRIMARY KEY,
  current_thesis TEXT,
  target_prices TEXT,
  entry_price REAL,
  timeline TEXT,
  confidence_score REAL,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Thesis history
CREATE TABLE IF NOT EXISTS thesis_history (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  thesis TEXT,
  reasoning TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_features_symbol ON features_snapshot(symbol);
CREATE INDEX IF NOT EXISTS idx_features_asof ON features_snapshot(asof);
CREATE INDEX IF NOT EXISTS idx_discoveries_symbol ON discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_discoveries_created ON discoveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON trading_decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_decisions_symbol ON portfolio_decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_decisions_created ON portfolio_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vigl_discoveries_symbol ON vigl_discoveries(symbol);
CREATE INDEX IF NOT EXISTS idx_vigl_discoveries_date ON vigl_discoveries(discovered_at);
`;

  // Execute schema synchronously
  console.log('🔧 Creating tables and indexes...');
  db.exec(schema);
  
  // Verify critical tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const tableNames = tables.map(t => t.name);
  
  console.log('✅ Database tables verified:');
  tableNames.forEach(name => console.log(`   - ${name}`));
  
  // Initialize default scoring weights if none exist
  const weightCount = db.prepare("SELECT COUNT(*) as count FROM scoring_weights").get();
  if (weightCount.count === 0) {
    const weights = [
      ['short_interest_weight', 2.0],
      ['borrow_fee_weight', 1.5], 
      ['volume_weight', 1.2],
      ['momentum_weight', 1.0],
      ['catalyst_weight', 0.8],
      ['float_penalty_weight', -0.6]
    ];
    
    const insertWeight = db.prepare('INSERT INTO scoring_weights (key, value) VALUES (?, ?)');
    
    for (const [key, value] of weights) {
      insertWeight.run(key, value);
    }
    
    console.log('✅ Default scoring weights initialized');
  }
  
  // Clean up
  db.close();
  
  console.log('🎯 DB MIGRATIONS APPLIED');
  console.log('📊 Schema guaranteed at:', dbPath);
  
  return true;
}

// Export for use in server/db/sqlite.js
module.exports = { ensureSchema };

// CLI execution
if (require.main === module) {
  const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'trading_dashboard.db');
  ensureSchema(dbPath);
}