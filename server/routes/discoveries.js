const express = require('express');
const router = express.Router();
const Engine = require('../services/squeeze/engine');
const db = require('../db/sqlite');

// POST /api/discoveries/run - Run the squeeze engine
router.post('/run', async (req, res) => {
  try {
    const out = await new Engine().run();
    res.json({ success: true, ...out });
  } catch (e) {
    console.error('Engine run error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

function safeParseJSON(x, fallback) {
  if (x == null) return fallback;
  if (x === 'undefined') return fallback;
  try { return JSON.parse(x); } catch { return fallback; }
}

// GET /api/discoveries/latest - Get latest discoveries from squeeze engine
router.get('/latest', async (req, res) => {
  try {
    const rows = await db.getLatestDiscoveriesForEngine(50);
    const items = rows.map(r => {
      const f = safeParseJSON(r.features_json, {});
      const a = safeParseJSON(r.audit_json, {});

      return {
        ticker: r.symbol,
        price: r.price,
        composite_score: r.score,
        action: r.action,
        catalyst: f.catalyst,
        technicals: f.technicals,
        short_interest_pct: f.short_interest_pct,
        days_to_cover: f.days_to_cover,
        borrow_fee_pct: f.borrow_fee_pct,
        avg_dollar_liquidity_30d: f.avg_dollar_liquidity_30d,
        entry_hint: {
          type: f?.technicals?.vwap_held_or_reclaimed ? 'vwap_reclaim' : 'base_breakout',
          trigger_price: f?.technicals?.vwap ?? f?.technicals?.price
        },
        risk: f?.technicals?.price ? {
          stop_loss: +(f.technicals.price * 0.9).toFixed(2),
          tp1: +(f.technicals.price * 1.2).toFixed(2),
          tp2: +(f.technicals.price * 1.5).toFixed(2)
        } : null,
        audit: {
          subscores: a.subscores,
          weights: a.weights,
          gates: a.gates,
          freshness: a.freshness
        }
      };
    }).filter(x => (x.action === 'BUY' || x.action === 'WATCHLIST'));
    res.json({ success: true, discoveries: items });
  } catch (e) {
    console.error('Latest discoveries error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/discoveries/top - Legacy endpoint for backward compatibility
router.get('/top', async (req, res) => {
  try {
    const rows = await db.getLatestDiscoveriesForEngine(10);
    const items = rows.map(r => {
      const f = safeParseJSON(r.features_json, {});
      return {
        symbol: r.symbol,
        name: r.symbol,
        currentPrice: r.price,
        marketCap: 100000000,
        volumeSpike: f.technicals?.rel_volume || 1.0,
        momentum: 0,
        breakoutStrength: Math.min(r.score / 100, 1.0),
        sector: 'Technology',
        catalysts: f.catalyst?.type ? [f.catalyst.type] : ['Pattern match'],
        similarity: Math.min(r.score / 100, 1.0),
        confidence: Math.min(r.score / 100, 1.0),
        isHighConfidence: r.score >= 75,
        estimatedUpside: r.score >= 75 ? '100-200%' : '50-100%',
        discoveredAt: r.created_at,
        riskLevel: r.score >= 70 ? 'MODERATE' : 'HIGH',
        recommendation: r.action,
        viglScore: Math.min(r.score / 100, 1.0)
      };
    }).filter(r => r.recommendation === 'BUY' || r.recommendation === 'WATCHLIST');
    
    res.json({
      success: true,
      count: items.length,
      discoveries: items
    });
  } catch (error) {
    console.error('Error fetching top discoveries:', error);
    res.json({
      success: false,
      error: error.message,
      discoveries: []
    });
  }
});

// GET /api/discoveries/diagnostics – summarizes last run state
router.get('/diagnostics', async (req, res) => {
  try {
    const db = require('../db/sqlite');
    const rows = await db.getLatestDiscoveriesForEngine(200);
    // count persisted actions
    const persisted = rows.length;
    // get a recent sample of audit trails from the live table for context
    const dropsHistogram = {};
    let sample = null;
    for (const r of rows) {
      const audit = safeParseJSON(r.audit_json, {});
      const reasons = audit.drops || [];
      for (const k of reasons) dropsHistogram[k] = (dropsHistogram[k] || 0) + 1;
      if (!sample) sample = { symbol: r.symbol, action: r.action, drops: reasons, subscores: audit.subscores };
    }
    res.json({
      success: true,
      persisted,
      drop_reasons_histogram: dropsHistogram,
      sample
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/discoveries/smoke – provider connectivity and env sanity
router.get('/smoke', async (_req, res) => {
  try {
    const smoke = { 
      polygon_key_present: !!process.env.POLYGON_API_KEY, 
      sqlite_path: process.env.SQLITE_PATH || 'default', 
      time: new Date().toISOString(),
      db_accessible: true
    };
    
    // Test database access
    try {
      const testQuery = db.db.prepare('SELECT COUNT(*) as count FROM discoveries').get();
      smoke.db_records = testQuery.count;
    } catch (dbErr) {
      smoke.db_accessible = false;
      smoke.db_error = dbErr.message;
    }
    
    res.json({ success: true, smoke });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/discoveries/_debug/smoke - debug smoke test  
router.get('/_debug/smoke', (_req, res) => {
  res.json({
    success: true,
    smoke: {
      polygon_key_present: !!process.env.POLYGON_API_KEY,
      sqlite_path: process.env.SQLITE_PATH || 'default',
      time: new Date().toISOString()
    }
  });
});

// GET /api/discoveries/raw - raw diagnostics without JSON parsing
router.get('/raw', async (_req, res) => {
  try {
    // Direct SQL to avoid JSON parsing issues
    const rawQuery = db.db.prepare(`
      SELECT symbol, action, score, created_at,
             CASE WHEN audit_json IS NULL THEN 'null'
                  WHEN audit_json = 'undefined' THEN 'undefined_string'
                  ELSE 'has_data' END as audit_status
      FROM discoveries 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();
    
    res.json({ 
      success: true, 
      total_records: rawQuery.length,
      sample_data: rawQuery,
      audit_stats: rawQuery.reduce((stats, row) => {
        stats[row.audit_status] = (stats[row.audit_status] || 0) + 1;
        return stats;
      }, {})
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/discoveries/_debug/diagnostics - debug diagnostics
router.get('/_debug/diagnostics', async (req, res) => {
  try {
    const rows = await db.getLatestDiscoveriesForEngine(50);
    res.json({ 
      success: true, 
      persisted: rows.length,
      sample: rows.length > 0 ? {
        symbol: rows[0].symbol,
        action: rows[0].action,
        audit_available: !!rows[0].audit_json
      } : null
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, stack: e.stack });
  }
});

// POST /api/discoveries/cleanup - Fix undefined JSON in database
router.post('/cleanup', async (req, res) => {
  try {
    const results = db.db.transaction(() => {
      // Fix features_json
      const fixFeatures = db.db.prepare(`
        UPDATE discoveries 
        SET features_json = '{}' 
        WHERE features_json = 'undefined' OR features_json IS NULL
      `).run();
      
      // Fix audit_json  
      const fixAudit = db.db.prepare(`
        UPDATE discoveries 
        SET audit_json = '{}' 
        WHERE audit_json = 'undefined' OR audit_json IS NULL
      `).run();
      
      // Get stats
      const stats = db.db.prepare(`
        SELECT 
          COUNT(*) as total_rows,
          SUM(CASE WHEN features_json = '{}' THEN 1 ELSE 0 END) as fixed_features,
          SUM(CASE WHEN audit_json = '{}' THEN 1 ELSE 0 END) as fixed_audit
        FROM discoveries
      `).get();
      
      return {
        features_fixed: fixFeatures.changes,
        audit_fixed: fixAudit.changes,
        stats
      };
    })();
    
    res.json({
      success: true,
      cleanup_results: results,
      message: `Fixed ${results.features_fixed} features_json and ${results.audit_fixed} audit_json records`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;