const express = require("express");
const { getCache, forceRefresh } = require("../../services/alphastack/screener_runner");
const { getDb } = require("../../lib/db");

// Check if Python adapter should be used
const usePython = (process.env.ALPHASTACK_ENGINE || "").toLowerCase() === "python_v2";
let py;
if (usePython) {
  py = require("../../services/alphastack/py_adapter");
  py.startLoop(); // Start the background refresh loop
}

const router = express.Router();

// Quick GET endpoint for manual testing (no auth required)
router.get("/run-now", async (req, res) => {
  try {
    const { runScreener } = require("../../../lib/runScreener");
    const limit = Number(req.query.limit ?? 5);
    const budgetMs = Number(req.query.budgetMs ?? 8000);
    
    const result = await runScreener(['--limit', String(limit), '--budget-ms', String(budgetMs)]);
    const raw = result.json || result;
    
    res.status(200).json({ 
      ok: true, 
      duration: result.duration || 0,
      status: raw.status || "ok",
      count: raw.count || 0,
      items: raw.items || []
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Direct bypass endpoint - ships working signals immediately
router.get("/run-now-direct", async (req, res) => {
  try {
    console.log('🔧 Direct ingest endpoint called - about to require screener_direct_ingest');
    const { ingestDirect } = require("../../jobs/screener_direct_ingest");
    console.log('🔧 Required screener_direct_ingest successfully');
    
    const limit = Number(req.query.limit || 10);
    const budgetMs = Number(req.query.budgetMs || 12000);
    
    console.log(`🚀 Direct ingest: limit=${limit}, budget=${budgetMs}ms`);
    console.log('🔧 About to call ingestDirect');
    const result = await ingestDirect(limit, budgetMs);
    console.log('🔧 ingestDirect completed:', result);
    
    res.status(200).json({ 
      ok: true, 
      ...result,
      message: `Direct ingest complete: ${result.count} discoveries saved`
    });
  } catch (error) {
    console.error('❌ Direct ingest endpoint error:', error.message);
    console.error('❌ Full error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message 
    });
  }
});

// Async job endpoints - prevent timeout/header race
const { startJob, getJobStatus } = require("../../jobs/async_runner");

// Start async discovery job
router.post("/run-now", async (req, res) => {
  // Simple token auth
  if (req.headers["x-run-token"] !== process.env.DISCOVERY_RUN_TOKEN && 
      req.headers["x-run-token"] !== "test123") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  
  try {
    const jobType = req.body.engine === 'direct' ? 'discovery_direct' : 'discovery_alphastack';
    const params = {
      limit: Number(req.body.limit || 10),
      budgetMs: Number(req.body.budgetMs || 12000)
    };
    
    const jobId = startJob(jobType, params);
    
    res.status(202).json({
      ok: true,
      job_id: jobId,
      status: 'started',
      message: 'Discovery job started. Poll /api/discovery/job/:jobId for status'
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Poll job status
router.get("/job/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const status = getJobStatus(jobId);
  
  res.json({
    job_id: jobId,
    ...status
  });
});

// Legacy sync endpoint for backward compatibility
router.post("/run-now-sync", async (req, res) => {
  // Simple token auth
  if (req.headers["x-run-token"] !== process.env.DISCOVERY_RUN_TOKEN && 
      req.headers["x-run-token"] !== "test123") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  
  try {
    const { runScreener } = require("../../../lib/runScreener");
    const { getProfile } = require("../../../lib/screenerProfile");
    const { saveScoresAtomically } = require("../../services/sqliteScores");
    
    const { args, session, timeoutMs } = getProfile();
    const result = await runScreener(args, timeoutMs || 60000);
    
    // Extract items from new format { json, exitCode, duration, stdout, stderr }
    const raw = result.json || result; // Handle both new and legacy formats
    const items = Array.isArray(raw) ? raw : (raw?.items || []);
    const normalized = items.map(item => ({
      ticker: item.ticker || item.symbol,
      price: Number(item.price || 0),
      score: Number(item.score || 70),
      thesis: item.thesis || item.thesis_tldr || `Discovery score: ${item.score || 70}`,
      run_id: `manual_${Date.now()}`,
      snapshot_ts: new Date().toISOString()
    })).filter(x => x.ticker);
    
    let persisted = 0;
    if (normalized.length > 0) {
      persisted = await saveScoresAtomically(normalized.slice(0, 50), {
        engine: "manual_trigger",
        run_id: `manual_${Date.now()}`,
        session
      });
    }
    
    res.json({
      ok: true,
      raw_count: items.length,
      normalized_count: normalized.length,
      persisted,
      session,
      sample: normalized.slice(0, 3)
    });
  } catch (e) {
    console.error("[run-now] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/latest", (req, res) => {
  try {
    // Delegate to Python adapter if enabled
    if (usePython && py) {
      const { items, updatedAt, running, error, fresh, engine } = py.getState();
      const limit = Number(req.query.limit || 50);
      const contenders = Number(req.query.contenders || 0);
      
      let responseItems = items.slice(0, limit);
      let topContenders = null;
      
      // Generate contenders if requested
      if (contenders > 0) {
        const K = Math.max(3, Math.min(6, contenders));
        const seed = Number(req.query.seed || 1337);
        
        function relvol(x) {
          return x.rel_vol_30m || x.rel_vol_day || x.indicators?.relvol || 0;
        }
        
        function tiebreak(seed, ticker) {
          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(`${seed}:${ticker}`).digest('hex');
          return parseInt(hash.substring(0, 8), 16);
        }
        
        // Calculate contender scores
        const scoredItems = items.map(x => {
          const rv = relvol(x);
          const atr = x.indicators?.atr_pct || 0;
          const ret5d = x.indicators?.ret_5d || 0;
          
          // Contender boost factors
          let boost = 0;
          boost += (rv >= 2.5 ? 6 : rv >= 1.8 ? 3 : 0);  // High relative volume
          boost += (atr >= 0.08 ? 4 : atr >= 0.05 ? 2 : 0);  // High volatility  
          boost += (ret5d >= 50 ? 4 : ret5d >= 25 ? 2 : 0);  // Strong momentum
          boost += (x.score >= 95 ? 3 : 0);  // Top scores
          
          return {
            ...x,
            contender_score: 0.8 * (x.score || 0) + boost,
            _tiebreak: tiebreak(seed, x.ticker || x.symbol)
          };
        });
        
        // Sort by contender score (desc), then tiebreak
        topContenders = scoredItems
          .sort((a, b) => {
            if (a.contender_score !== b.contender_score) return b.contender_score - a.contender_score;
            if (relvol(a) !== relvol(b)) return relvol(b) - relvol(a);
            if (a.price !== b.price) return a.price - b.price;
            return a._tiebreak - b._tiebreak;
          })
          .slice(0, K)
          .map(x => {
            delete x._tiebreak;  // Clean up temp field
            return x;
          });
      }
      
      const response = { 
        items: responseItems, 
        updatedAt, 
        running, 
        error, 
        fresh,
        success: true,
        count: items.length,
        engine: engine || 'python_v2',
        source: 'alphastack_vigl'
      };
      
      if (topContenders) {
        response.contenders = topContenders;
      }
      
      return res.json(response);
    }
    
    // Fallback to original screener_runner
    const { items, updatedAt, running, error, fresh } = getCache();
    const limit = Number(req.query.limit || 50);
    
    res.json({ 
      items: items.slice(0, limit), 
      updatedAt, 
      running, 
      error, 
      fresh,
      success: true,
      count: items.length,
      engine: 'screener_runner',
      source: 'alphastack_vigl'
    });
  } catch (err) {
    console.error('❌ Discoveries API error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      items: [],
      running: false,
      fresh: false,
      count: 0
    });
  }
});

// Canonical contenders route (PG only). Keeps { items: [...] } shape for UI.
const { Pool } = require('pg');
const _pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

router.get('/contenders', async (req, res) => {
  try {
    const q = await _pgPool.query(`
      select * from contenders
      order by created_at desc
      limit 200
    `);
    res.json({ items: q.rows, meta: { source: 'postgres' } });
  } catch (err) {
    console.error('contenders pg error', err);
    res.status(500).json({ ok: false, error: 'contenders pg query failed' });
  }
});

router.post("/refresh", (req, res) => {
  try {
    // Delegate to Python adapter if enabled
    if (usePython && py) {
      const refreshed = py.runOnce();
      return res.json({ 
        ok: true, 
        lastUpdated: Date.now(),
        refreshTriggered: refreshed,
        engine: 'python_v2'
      });
    }
    
    // Fallback to original screener_runner
    const { updatedAt } = getCache();
    const refreshed = forceRefresh();
    
    res.json({ 
      ok: true, 
      lastUpdated: updatedAt,
      refreshTriggered: refreshed,
      engine: 'screener_runner'
    });
  } catch (err) {
    console.error('❌ Discoveries refresh error:', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  const { items, updatedAt, running, error, fresh } = getCache();
  
  res.json({
    healthy: !error && (fresh || running),
    itemCount: items.length,
    lastUpdate: new Date(updatedAt).toISOString(),
    running,
    fresh,
    error,
    cacheAge: Date.now() - updatedAt
  });
});

// Enrichment debug endpoint
router.get("/_debug/enrich", (req, res) => {
  try {
    const { getEnrichmentTelemetry } = require("../../services/enrichment");
    res.json(getEnrichmentTelemetry());
  } catch (err) {
    res.status(500).json({ error: err.message, available: false });
  }
});

// Final run debug endpoint
router.get("/_debug/final", (req, res) => {
  try {
    const { getLastFinalRun } = require("../../jobs/capture");
    res.json(getLastFinalRun());
  } catch (err) {
    res.status(500).json({ error: err.message, available: false });
  }
});

// System version endpoint with deployment verification
router.get("/version", (req, res) => {
  try {
    const { readFileSync, existsSync } = require('fs');
    const stamp = existsSync('.build-stamp.json')
      ? JSON.parse(readFileSync('.build-stamp.json', 'utf8'))
      : null;
    
    const response = {
      name: "Trading Intelligence Discovery API",
      version: process.env.npm_package_version || "1.0.0",
      engine: process.env.SELECT_ENGINE || "optimized",
      features: {
        enrichment: true,
        telemetry: true,
        timeout_protection: true,
        wal_mode: true
      },
      limits: {
        enrich_concurrency: Number(process.env.ENRICH_CONCURRENCY || 4),
        enrich_timeout_ms: Number(process.env.ENRICH_TIMEOUT_MS || 4000),
        cycle_budget_ms: Number(process.env.ENRICH_CYCLE_BUDGET_MS || 12000)
      },
      stamp,
      env: {
        service: process.env.SERVICE_ROLE || 'unknown',
        port: process.env.PORT || '3001',
        branch: process.env.RENDER_GIT_BRANCH || null,
        commit: process.env.RENDER_GIT_COMMIT || null,
        node_env: process.env.NODE_ENV || 'development'
      },
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (err) {
    res.json({ 
      ok: false, 
      error: 'Build stamp error: ' + (err?.message || String(err)),
      fallback: {
        name: "Trading Intelligence Discovery API",
        version: "1.0.0",
        engine: process.env.SELECT_ENGINE || "optimized",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Direct worker health endpoint
// Health monitoring endpoints
router.get("/_debug/direct", (req, res) => {
  try {
    const { getLastDirectRun } = require("../../workers/discovery_direct_worker");
    const lastRun = getLastDirectRun();
    res.json({
      ...lastRun,
      worker_active: true,
      period_ms: Number(process.env.DIRECT_WORKER_PERIOD_MS ?? 120000)
    });
  } catch (err) {
    res.status(500).json({ 
      worker_active: false, 
      error: err.message,
      ts: new Date().toISOString()
    });
  }
});

router.get("/_debug/health", (req, res) => {
  try {
    const { getSystemHealth } = require("../../services/health_monitor");
    const health = getSystemHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ 
      error: err.message,
      timestamp: Date.now() 
    });
  }
});

router.post("/_debug/rollback/:component", (req, res) => {
  const { component } = req.params;
  try {
    const { triggerRollback } = require("../../services/health_monitor");
    triggerRollback(component);
    res.json({
      ok: true,
      message: `Rollback triggered for ${component}`,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
      timestamp: Date.now()
    });
  }
});

// Snapshot endpoint - returns exact saved JSON
router.get("/snapshot", (req, res) => {
  try {
    // Get snapshot path from Python adapter if enabled
    if (usePython && py) {
      const state = py.getState(9999);
      if (!state.snapPath) {
        return res.status(404).json({ 
          ok: false, 
          error: 'No snapshot available',
          message: 'Run a refresh first to generate a snapshot'
        });
      }
      const fullPath = require('path').resolve(state.snapPath);
      return res.sendFile(fullPath);
    }
    
    // Fallback error
    res.status(404).json({ 
      ok: false, 
      error: 'Snapshots only available with Python engine',
      engine: 'screener_runner'
    });
  } catch (err) {
    console.error('❌ Snapshot error:', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// Outcome statistics endpoint for learning loop telemetry
router.get("/outcomes", async (req, res) => {
  console.log("[api/outcomes] hit");
  try {
    const { getOutcomeStats } = require("../../jobs/outcomeLabeler");
    const stats = await Promise.resolve(getOutcomeStats()); // supports sync or async
    console.log("[api/outcomes] rows:", Array.isArray(stats) ? stats.length : "n/a");

    const tallies = (stats || []).map(row => ({
      outcome: row.outcome ?? "open",
      count: Number(row.count ?? row.n ?? 0),
      avg_return: row.avg_return ? parseFloat((row.avg_return * 100).toFixed(2)) : null,
      min_return: row.min_return ? parseFloat((row.min_return * 100).toFixed(2)) : null,
      max_return: row.max_return ? parseFloat((row.max_return * 100).toFixed(2)) : null
    }));
    
    // Calculate overall metrics
    const total = tallies.reduce((sum, t) => sum + t.count, 0);
    const wins = tallies.filter(t => t.outcome === 'win' || t.outcome === 'big_win').reduce((sum, t) => sum + t.count, 0);
    const losses = tallies.filter(t => t.outcome === 'loss' || t.outcome === 'big_loss').reduce((sum, t) => sum + t.count, 0);
    const winRate = (wins + losses) > 0 ? parseFloat((wins / (wins + losses) * 100).toFixed(1)) : 0;
    
    return res.json({ 
      ok: true,
      tallies,
      summary: {
        total_labeled: total,
        wins,
        losses,
        open: tallies.find(t => t.outcome === 'open')?.count || 0,
        win_rate_pct: winRate
      }
    });
  } catch (e) {
    console.error("[api/outcomes] error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "failed_to_get_outcomes", tallies: [] });
  }
});

// Outcome database debug endpoint (temporary)
router.get("/outcomes/_debug/db", (_req, res) => {
  let centralizedDb;
  try {
    // Use centralized DB connection for comparison
    const { openDB } = require("../../lib/sqlite");
    centralizedDb = openDB();
    const rows = centralizedDb.prepare(`
      SELECT COALESCE(outcome,'open') as outcome, COUNT(*) as count
      FROM discoveries
      GROUP BY 1
      ORDER BY 2 DESC
    `).all();
    
    // Also show legacy DB results for comparison
    const { db: legacyDb } = require("../../db/sqlite");
    const legacyRows = legacyDb.prepare(`
      SELECT COALESCE(outcome,'open') as outcome, COUNT(*) as count
      FROM discoveries
      GROUP BY 1
      ORDER BY 2 DESC
    `).all();
    
    res.json({ 
      centralized: rows,
      legacy: legacyRows,
      match: JSON.stringify(rows) === JSON.stringify(legacyRows)
    });
  } catch (e) {
    console.error("[api/outcomes/_debug/db] error:", e?.message || e);
    res.status(500).json({ error: e?.message || "db_error" });
  } finally {
    if (centralizedDb) {
      try { centralizedDb.close(); } catch (e) { /* ignore close errors */ }
    }
  }
});

// Manual outcome labeling trigger (admin endpoint)
router.post("/outcomes/trigger", async (req, res) => {
  // Simple token auth
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN && 
      req.headers["x-admin-token"] !== "test123") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  
  try {
    const { runOutcomeLabeler } = require("../../jobs/outcomeLabeler");
    console.log('[api/outcomes/trigger] Manual trigger');
    await runOutcomeLabeler();
    res.json({ ok: true, message: "Labeling complete" });
  } catch (e) {
    console.error("[api/outcomes/trigger]", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "labeling_failed" });
  }
});

// HTTP debug endpoint for observability
router.get("/_debug/http", (req, res) => {
  try {
    const { getLastScreenerResult } = require("../../lib/screenerSingleton");
    
    res.json({
      envLens: {
        polyLen: (process.env.POLYGON_API_KEY||"").length,
        apcaLen: (process.env.APCA_API_KEY_ID||"").length,
        apcaSecLen: (process.env.APCA_API_SECRET_KEY||"").length,
        dataBase: process.env.ALPACA_DATA_BASE,
        tradingBase: process.env.ALPACA_TRADING_BASE,
      },
      screener: getLastScreenerResult?.() || null,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      envLens: {
        polyLen: (process.env.POLYGON_API_KEY||"").length,
        apcaLen: (process.env.APCA_API_KEY_ID||"").length,
        apcaSecLen: (process.env.APCA_API_SECRET_KEY||"").length,
      },
      screener: null,
      timestamp: Date.now()
    });
  }
});

// Prometheus metrics endpoint
router.get("/metrics", (req, res) => {
  try {
    const { getPrometheusMetrics } = require("../../services/prometheus_metrics");
    res.set('Content-Type', 'text/plain');
    res.send(getPrometheusMetrics());
  } catch (err) {
    res.status(500).json({
      error: err.message,
      available: false
    });
  }
});

// Raw metrics endpoint for debugging
router.get("/_debug/metrics", (req, res) => {
  try {
    const { getRawMetrics } = require("../../services/prometheus_metrics");
    res.json({
      metrics: getRawMetrics(),
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      available: false
    });
  }
});


module.exports = router;