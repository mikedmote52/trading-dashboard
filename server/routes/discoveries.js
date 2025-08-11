const express = require('express');
const router = express.Router();
const Engine = require('../services/squeeze/engine');
const db = require('../db/sqlite');

// simple in-memory job registry
const jobs = new Map();
let lastJob = null;

// POST /api/discoveries/scan -> alias for /run (frontend compatibility)
router.post('/scan', async (req, res) => {
  const id = `scan-${Date.now()}`;
  const job = { id, status: 'queued', started: null, finished: null, error: null, candidates: 0 };
  jobs.set(id, job);
  lastJob = job;
  res.status(202).json({ success: true, job: id, count: 0 });

  setImmediate(async () => {
    const job = jobs.get(id);
    if (!job) return;
    job.status = 'running';
    job.started = new Date().toISOString();

    try {
      const out = await new Engine().run();
      job.status = 'done';
      job.finished = new Date().toISOString();
      job.candidates = (out.candidates || []).length;
    } catch (e) {
      job.status = 'error';
      job.finished = new Date().toISOString();
      job.error = e.message;
      console.error('Engine scan error:', e);
    }
  });
});

// POST /api/discoveries/run -> 202 with job id, engine runs in background
router.post('/run', async (req, res) => {
  const id = `run-${Date.now()}`;
  const job = { id, status: 'queued', started: null, finished: null, error: null, candidates: 0 };
  jobs.set(id, job);
  lastJob = job;
  res.status(202).json({ success: true, job: id });

  setImmediate(async () => {
    const job = jobs.get(id);
    if (!job) return;
    job.status = 'running';
    job.started = new Date().toISOString();

    try {
      const out = await new Engine().run();
      job.status = 'done';
      job.finished = new Date().toISOString();
      job.candidates = (out.candidates || []).length;
    } catch (e) {
      job.status = 'error';
      job.finished = new Date().toISOString();
      job.error = e.message;
      console.error('Engine run error:', e);
    }
  });
});

// GET /api/discoveries/run/:job -> job status
router.get('/run/:job', (req, res) => {
  const job = jobs.get(req.params.job);
  if (!job) return res.status(404).json({ success: false, error: 'unknown job' });
  res.json({ success: true, job: { id: job.id, status: job.status, candidates: job.candidates ?? 0, error: job.error || null } });
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
    }).filter(x => (x.action === 'BUY' || x.action === 'WATCHLIST' || x.action === 'MONITOR'));
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
    }).filter(r => r.recommendation === 'BUY' || r.recommendation === 'WATCHLIST' || r.recommendation === 'MONITOR');
    
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

// GET /api/discoveries/diagnostics – drop and missing histograms
router.get('/diagnostics', async (_req, res) => {
  try {
    const rows = await db.getLatestDiscoveriesForEngine(500);
    const drops = {};
    const missing = {};
    let totalRunSize = 0;
    let totalCandidatesReady = 0;
    let preEnrichCount = 0;
    
    for (const r of rows) {
      let a = {};
      let f = {};
      try { a = JSON.parse(r.audit_json || '{}'); } catch {}
      try { f = JSON.parse(r.features_json || '{}'); } catch {}
      
      // Handle pre-enrichment audits
      if (r.symbol === 'AUDIT_PRE_ENRICH') {
        preEnrichCount++;
        totalRunSize += (f.run_size || 0);
        totalCandidatesReady += (f.candidates_ready || 0);
        
        // Merge missing histogram
        if (a.missing && typeof a.missing === 'object') {
          for (const [k, v] of Object.entries(a.missing)) {
            missing[k] = (missing[k] || 0) + Number(v || 0);
          }
        }
      }
      
      // Handle drops from gates
      const d = a.drops;
      if (d) {
        if (Array.isArray(d)) {
          for (const k of d) drops[k] = (drops[k] || 0) + 1;
        } else if (typeof d === 'object') {
          for (const [k, v] of Object.entries(d)) drops[k] = (drops[k] || 0) + Number(v || 0);
        }
      }
    }
    
    const avgRunSize = preEnrichCount > 0 ? Math.round(totalRunSize / preEnrichCount) : 0;
    const avgCandidatesReady = preEnrichCount > 0 ? Math.round(totalCandidatesReady / preEnrichCount) : 0;
    
    res.json({ 
      success: true, 
      sample: rows.length,
      avg_run_size: avgRunSize,
      avg_candidates_ready: avgCandidatesReady,
      missing,
      drops
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

// GET /api/discoveries/_debug/inspect - inspect raw persisted data
router.get('/_debug/inspect', async (req, res) => {
  try {
    const rows = db.db.prepare(`
      SELECT symbol, features_json, audit_json, created_at
      FROM discoveries 
      ORDER BY created_at DESC 
      LIMIT 2
    `).all();
    
    res.json({ 
      success: true, 
      count: rows.length,
      rows: rows.map(r => ({
        symbol: r.symbol,
        created_at: r.created_at,
        features_json: r.features_json ? r.features_json.substring(0, 100) + '...' : null,
        audit_json: r.audit_json ? r.audit_json.substring(0, 100) + '...' : null,
        features_has_data: !!r.features_json,
        audit_has_data: !!r.audit_json
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/discoveries/_debug/last-error - get last job for diagnosis
router.get('/_debug/last-error', (_req, res) => {
  try {
    res.json({ 
      success: true, 
      last: lastJob ? { id: lastJob.id, status: lastJob.status, error: lastJob.error || null } : null 
    });
  } catch (e) { 
    res.status(500).json({ success: false, error: e.message }); 
  }
});

module.exports = router;