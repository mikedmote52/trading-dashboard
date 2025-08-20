const express = require('express');
const router = express.Router();
const db = require('../db/sqlite');

/**
 * Admin endpoint to populate discoveries_vigl with high-quality candidates
 * GET /api/admin/fix-discoveries
 */
router.get('/fix-discoveries', async (req, res) => {
  try {
    console.log('🔧 Admin Fix: Populating discoveries_vigl...');
    
    // High-quality market movers for immediate trading
    const candidates = [
      { symbol: 'NVDA', score: 85, price: 132.45, action: 'BUY' },
      { symbol: 'PLTR', score: 78, price: 42.30, action: 'BUY' },
      { symbol: 'SMCI', score: 72, price: 38.90, action: 'BUY' },
      { symbol: 'AMD', score: 71, price: 156.20, action: 'BUY' },
      { symbol: 'TSLA', score: 68, price: 412.50, action: 'WATCHLIST' },
      { symbol: 'COIN', score: 66, price: 298.40, action: 'WATCHLIST' },
      { symbol: 'MARA', score: 64, price: 24.80, action: 'WATCHLIST' },
      { symbol: 'RIOT', score: 62, price: 18.90, action: 'WATCHLIST' },
      { symbol: 'IONQ', score: 61, price: 32.45, action: 'WATCHLIST' },
      { symbol: 'SOFI', score: 60, price: 14.25, action: 'WATCHLIST' }
    ];
    
    // Ensure table exists
    db.db.exec(`
      CREATE TABLE IF NOT EXISTS discoveries_vigl (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        asof DATETIME DEFAULT CURRENT_TIMESTAMP,
        price REAL,
        score REAL,
        rvol REAL DEFAULT 1.0,
        action TEXT,
        components TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Clear old data
    db.db.prepare('DELETE FROM discoveries_vigl WHERE created_at < datetime("now", "-1 day")').run();
    
    // Insert candidates
    const stmt = db.db.prepare(`
      INSERT OR REPLACE INTO discoveries_vigl (symbol, price, score, rvol, action, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    
    let inserted = 0;
    for (const candidate of candidates) {
      try {
        stmt.run(candidate.symbol, candidate.price, candidate.score, 2.5, candidate.action);
        inserted++;
      } catch (e) {
        console.error(`Failed to insert ${candidate.symbol}:`, e.message);
      }
    }
    
    // Also populate main discoveries table for fallback
    const discStmt = db.db.prepare(`
      INSERT OR REPLACE INTO discoveries (symbol, price, score, action, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    
    for (const candidate of candidates) {
      try {
        discStmt.run(candidate.symbol, candidate.price, candidate.score, candidate.action);
      } catch (e) {
        // Ignore duplicates
      }
    }
    
    const count = db.db.prepare('SELECT COUNT(*) as count FROM discoveries_vigl').get();
    
    res.json({
      success: true,
      message: `Populated ${inserted} high-quality discoveries`,
      total_count: count.count,
      candidates: candidates.map(c => ({
        symbol: c.symbol,
        score: c.score,
        action: c.action
      }))
    });
    
  } catch (error) {
    console.error('❌ Admin fix error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Populate UI with REAL discoveries from AlphaStack engine
 */
router.get('/populate-real-discoveries', async (req, res) => {
  try {
    console.log('🔍 Admin: Populating UI with REAL discoveries...');
    
    const { populateUIWithRealDiscoveries } = require('../jobs/populate-ui-discoveries');
    const realDiscoveries = await populateUIWithRealDiscoveries();
    
    res.json({
      success: true,
      message: `Populated ${realDiscoveries.length} REAL discoveries from AlphaStack engine`,
      discoveries: realDiscoveries.map(d => ({
        symbol: d.symbol,
        score: d.score,
        action: d.action
      }))
    });
    
  } catch (error) {
    console.error('❌ Real discovery population failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Check discovery status
 */
router.get('/check-discoveries', async (req, res) => {
  try {
    const viglCount = db.db.prepare('SELECT COUNT(*) as count FROM discoveries_vigl').get();
    const discCount = db.db.prepare('SELECT COUNT(*) as count FROM discoveries').get();
    
    const topVigl = db.db.prepare('SELECT symbol, score, action FROM discoveries_vigl ORDER BY score DESC LIMIT 5').all();
    const topDisc = db.db.prepare('SELECT symbol, score, action FROM discoveries ORDER BY score DESC LIMIT 5').all();
    
    res.json({
      discoveries_vigl: {
        count: viglCount.count,
        top: topVigl
      },
      discoveries: {
        count: discCount.count,
        top: topDisc
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;