const Database = require('better-sqlite3');
const path = require('path');

// CRITICAL: Resolve database path and ensure schema BEFORE any queries
const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', '..', 'trading_dashboard.db');
console.log(`📊 SQLite database path: ${dbPath}`);

// Run schema creation synchronously BEFORE creating any prepared statements
const { ensureSchema } = require('../../scripts/init_db');
ensureSchema(dbPath);

// NOW it's safe to create the database connection and prepare statements
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('✅ SQLite schema verified/created');

// Prepared statements for features (now safe because table exists)
const insertFeaturesSnapshot = db.prepare(`
  INSERT OR REPLACE INTO features_snapshot 
  (symbol, asof, short_interest_pct, borrow_fee_7d_change, rel_volume, 
   momentum_5d, catalyst_flag, float_shares)
  VALUES (@symbol, @asof, @short_interest_pct, @borrow_fee_7d_change, 
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
const getScoringWeights = () => {
  const stmt = db.prepare(`SELECT key, value FROM scoring_weights`);
  const rows = stmt.all();
  
  // Convert to object format expected by the code
  const weights = {};
  rows.forEach(row => {
    weights[row.key] = row.value;
  });
  
  // Return default if no weights found
  if (Object.keys(weights).length === 0) {
    return {
      short_interest_weight: 2.0,
      borrow_fee_weight: 1.5,
      volume_weight: 1.2,
      momentum_weight: 1.0,
      catalyst_weight: 0.8,
      float_penalty_weight: -0.6
    };
  }
  
  return weights;
};

const upsertScoringWeights = (weights) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO scoring_weights (key, value)
    VALUES (?, ?)
  `);
  
  Object.entries(weights).forEach(([key, value]) => {
    stmt.run(key, value);
  });
};

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