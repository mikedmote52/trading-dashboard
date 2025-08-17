/**
 * Discoveries Repository - Atomic Persistence with Price Validation
 * Handles VIGL discovery data with idempotent upserts and price safety
 */

const Database = require('better-sqlite3');
const { DISCOVERY } = require('../../config/discovery');

// Initialize database connection (reuse existing connection)
let db;
try {
  const dbPath = process.env.SQLITE_DB_PATH || './trading_dashboard.db';
  db = new Database(dbPath);
  console.log('📊 Discoveries repository connected to:', dbPath);
} catch (error) {
  console.error('❌ Database connection failed:', error.message);
  throw error;
}

/**
 * Ensure discoveries_vigl table exists with proper schema
 */
function ensureSchema() {
  try {
    // Create new optimized discoveries table
    db.exec(`
      CREATE TABLE IF NOT EXISTS discoveries_vigl (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        asof DATETIME NOT NULL,
        price REAL NOT NULL CHECK (price > 0),
        score REAL NOT NULL CHECK (score >= 0),
        rvol REAL NOT NULL DEFAULT 1.0,
        action TEXT NOT NULL CHECK (action IN ('BUY', 'WATCHLIST', 'MONITOR', 'DROP')),
        components TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create unique constraint for idempotent upserts
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_discoveries_vigl_symbol_asof 
      ON discoveries_vigl(symbol, asof);
    `);
    
    // Create performance indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_discoveries_vigl_score 
      ON discoveries_vigl(score DESC);
      
      CREATE INDEX IF NOT EXISTS idx_discoveries_vigl_action 
      ON discoveries_vigl(action);
      
      CREATE INDEX IF NOT EXISTS idx_discoveries_vigl_asof 
      ON discoveries_vigl(asof DESC);
    `);
    
    console.log('✅ Discoveries VIGL schema ensured');
    
  } catch (error) {
    console.error('❌ Schema creation failed:', error.message);
    throw error;
  }
}

// Prepared statements for atomic operations
let saveDiscoveryStmt, getRecentDiscoveriesStmt, getDiscoveriesByActionStmt;

function initializeStatements() {
  try {
    // Atomic upsert statement
    saveDiscoveryStmt = db.prepare(`
      INSERT INTO discoveries_vigl 
        (symbol, asof, price, score, rvol, action, components, updated_at)
      VALUES 
        (@symbol, @asof, @price, @score, @rvol, @action, @components, CURRENT_TIMESTAMP)
      ON CONFLICT(symbol, asof) DO UPDATE SET
        price = excluded.price,
        score = excluded.score,
        rvol = excluded.rvol,
        action = excluded.action,
        components = excluded.components,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    // Query for recent discoveries
    getRecentDiscoveriesStmt = db.prepare(`
      SELECT 
        symbol, asof, price, score, rvol, action, components, created_at, updated_at
      FROM discoveries_vigl 
      WHERE asof > datetime('now', '-24 hours')
      ORDER BY score DESC, updated_at DESC
      LIMIT ?
    `);
    
    // Query by action type
    getDiscoveriesByActionStmt = db.prepare(`
      SELECT 
        symbol, asof, price, score, rvol, action, components, created_at, updated_at
      FROM discoveries_vigl 
      WHERE action = ? AND asof > datetime('now', '-24 hours')
      ORDER BY score DESC, updated_at DESC
    `);
    
    console.log('✅ Prepared statements initialized');
    
  } catch (error) {
    console.error('❌ Statement preparation failed:', error.message);
    throw error;
  }
}

/**
 * Save discovery result atomically with price validation
 * @param {Object} result VIGL scoring result
 * @param {Date} asof Timestamp for the discovery
 * @returns {Object} Save result with success status
 */
function saveDiscoveryAtomic(result, asof = new Date()) {
  if (!result || !result.symbol) {
    throw new Error('Invalid discovery result - missing symbol');
  }
  
  if (!result.price || result.price <= 0) {
    throw new Error(`Invalid price for ${result.symbol}: ${result.price}`);
  }
  
  if (DISCOVERY.enforcePriceCap && result.price > DISCOVERY.priceCap) {
    console.log(`⚠️ Skipping ${result.symbol} - price $${result.price} exceeds cap of $${DISCOVERY.priceCap}`);
    return { success: false, reason: 'price_cap_exceeded' };
  }
  
  try {
    const params = {
      symbol: result.symbol,
      asof: asof.toISOString(),
      price: Number(result.price.toFixed(2)),
      score: Number(result.score.toFixed(3)),
      rvol: Number((result.rvol || 1.0).toFixed(2)),
      action: result.action || 'DROP',
      components: JSON.stringify(result.components || {})
    };
    
    const info = saveDiscoveryStmt.run(params);
    
    console.log(`💾 Saved discovery: ${result.symbol} (score: ${result.score}, action: ${result.action})`);
    
    return {
      success: true,
      symbol: result.symbol,
      rowId: info.lastInsertRowid,
      changes: info.changes
    };
    
  } catch (error) {
    console.error(`❌ Failed to save discovery for ${result.symbol}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get recent discoveries for dashboard
 * @param {number} limit Maximum number of discoveries to return
 * @returns {Array} Array of discovery objects
 */
function getRecentDiscoveries(limit = 50) {
  try {
    const rows = getRecentDiscoveriesStmt.all(limit);
    
    return rows.map(row => ({
      rank: null, // Will be set by caller based on sort order
      symbol: row.symbol,
      price: Number(row.price),
      score: Number(row.score),
      rvol: Number(row.rvol),
      action: row.action,
      asof: row.asof,
      components: JSON.parse(row.components || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    
  } catch (error) {
    console.error('❌ Failed to get recent discoveries:', error.message);
    return [];
  }
}

/**
 * Get discoveries by action type
 * @param {string} action Action type (BUY, WATCHLIST, MONITOR)
 * @returns {Array} Filtered discoveries
 */
function getDiscoveriesByAction(action) {
  try {
    const rows = getDiscoveriesByActionStmt.all(action);
    return rows.map(row => ({
      symbol: row.symbol,
      price: Number(row.price),
      score: Number(row.score),
      rvol: Number(row.rvol),
      action: row.action,
      asof: row.asof,
      components: JSON.parse(row.components || '{}')
    }));
  } catch (error) {
    console.error(`❌ Failed to get ${action} discoveries:`, error.message);
    return [];
  }
}

/**
 * Get discovery statistics
 * @returns {Object} Statistics about recent discoveries
 */
function getDiscoveryStats() {
  try {
    const stats = db.prepare(`
      SELECT 
        action,
        COUNT(*) as count,
        AVG(score) as avg_score,
        MAX(score) as max_score
      FROM discoveries_vigl 
      WHERE asof > datetime('now', '-24 hours')
      GROUP BY action
      ORDER BY avg_score DESC
    `).all();
    
    const total = db.prepare(`
      SELECT COUNT(*) as total 
      FROM discoveries_vigl 
      WHERE asof > datetime('now', '-24 hours')
    `).get();
    
    return {
      total: total.total,
      byAction: stats,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Failed to get discovery stats:', error.message);
    return { total: 0, byAction: [], timestamp: new Date().toISOString() };
  }
}

// Initialize schema and statements
ensureSchema();
initializeStatements();

module.exports = {
  saveDiscoveryAtomic,
  getRecentDiscoveries,
  getDiscoveriesByAction,
  getDiscoveryStats,
  db
};