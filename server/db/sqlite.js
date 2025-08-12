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
    SELECT d1.* FROM discoveries d1
    INNER JOIN (
      SELECT symbol, MAX(score) as max_score, MAX(created_at) as latest_created
      FROM discoveries 
      WHERE DATE(created_at) = DATE(?)
      GROUP BY symbol
    ) d2 ON d1.symbol = d2.symbol 
         AND d1.score = d2.max_score 
         AND d1.created_at = d2.latest_created
    ORDER BY d1.score DESC
  `);
  return stmt.all(today);
};

const getLatestDiscoveries = (limit = 10) => {
  const stmt = db.prepare(`
    SELECT d1.* FROM discoveries d1
    INNER JOIN (
      SELECT symbol, MAX(score) as max_score, MAX(created_at) as latest_created
      FROM discoveries 
      GROUP BY symbol
    ) d2 ON d1.symbol = d2.symbol 
         AND d1.score = d2.max_score 
         AND d1.created_at = d2.latest_created
    ORDER BY d1.created_at DESC
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

// Backward-compatible scoring weights functions
const getScoringWeights = () => {
  // Try KV table first
  try {
    const kvStmt = db.prepare(`SELECT key, value FROM scoring_weights_kv`);
    const kvRows = kvStmt.all();
    
    if (kvRows.length > 0) {
      const weights = {};
      kvRows.forEach(row => {
        weights[row.key] = row.value;
      });
      return weights;
    }
  } catch (err) {
    console.log('ℹ️  scoring_weights_kv table not available, trying legacy...');
  }
  
  // Try legacy table format
  try {
    const legacyStmt = db.prepare(`
      SELECT weight_short_interest, weight_borrow_fee, weight_volume, 
             weight_momentum, weight_catalyst, weight_float_penalty 
      FROM scoring_weights LIMIT 1
    `);
    const legacyRow = legacyStmt.get();
    
    if (legacyRow) {
      return {
        short_interest_weight: legacyRow.weight_short_interest || 2.0,
        borrow_fee_weight: legacyRow.weight_borrow_fee || 1.5,
        volume_weight: legacyRow.weight_volume || 1.2,
        momentum_weight: legacyRow.weight_momentum || 1.0,
        catalyst_weight: legacyRow.weight_catalyst || 0.8,
        float_penalty_weight: legacyRow.weight_float_penalty || -0.6
      };
    }
  } catch (err) {
    console.log('ℹ️  Legacy scoring_weights format not available, using defaults');
  }
  
  // Fall back to defaults
  return {
    short_interest_weight: 2.0,
    borrow_fee_weight: 1.5,
    volume_weight: 1.2,
    momentum_weight: 1.0,
    catalyst_weight: 0.8,
    float_penalty_weight: -0.6
  };
};

const upsertScoringWeights = (weights) => {
  // Always write to KV table (new format)
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO scoring_weights_kv (key, value)
    VALUES (?, ?)
  `);
  
  Object.entries(weights).forEach(([key, value]) => {
    stmt.run(key, value);
  });
};

// New helpers for squeeze engine
const insertDiscovery = (row) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO discoveries
      (id, symbol, price, score, preset, action, features_json, audit_json, created_at)
    VALUES
      (@id, @symbol, @price, @score, @preset, @action, @features_json, @audit_json,
       COALESCE(@created_at, datetime('now')))
  `);
  const params = {
    id: row.id, 
    symbol: row.symbol, 
    price: Number.isFinite(Number(row.price)) ? Number(row.price) : 0, 
    score: row.score ?? 0,
    preset: row.preset ?? null, 
    action: row.action ?? null,
    features_json: row.features_json ?? null, 
    audit_json: row.audit_json ?? null,
    created_at: row.created_at ?? null
  };
  return stmt.run(params);
};

const getLatestDiscoveriesForEngine = (limit = 50) => {
  const stmt = db.prepare(`
    SELECT id, symbol, price, score, preset, action, features_json, audit_json, created_at
    FROM discoveries
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
};

module.exports = {
  db,
  insertFeaturesSnapshot,
  getLatestFeatures,
  upsertDiscovery,
  getTodaysDiscoveries,
  getLatestDiscoveries,
  getLatestDiscoveriesForEngine,
  insertDiscovery,
  getThesis,
  upsertThesis,
  insertThesisHistory,
  insertDecision,
  getLatestDecision,
  getScoringWeights,
  upsertScoringWeights
};