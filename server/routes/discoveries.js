const express = require('express');
const router = express.Router();
const Engine = require('../services/squeeze/engine');
const EngineOptimized = require('../services/squeeze/engine_optimized');
const db = require('../db/sqlite');
const { safeNum, formatPrice, formatPercent, formatMultiplier } = require('../services/squeeze/metrics_safety');

// New unified service and mapper
const { scanOnce, topDiscoveries, getEngineInfo } = require('../services/discovery_service');
const { toUiDiscovery, mapDiscoveries } = require('./mappers/to_ui_discovery');

// simple in-memory job registry
const jobs = new Map();
let lastJob = null;

// Debug endpoint to prove which engine is actually active
router.get('/_debug/engine', (req, res) => {
  try {
    const engineInfo = getEngineInfo();
    res.json({ 
      success: true,
      ...engineInfo,
      process_env: {
        SELECT_ENGINE: process.env.SELECT_ENGINE,
        USE_OPTIMIZED_ENGINE: process.env.USE_OPTIMIZED_ENGINE,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      fallback_info: {
        env_setting: process.env.SELECT_ENGINE || 'v1',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// POST /api/discoveries/scan -> unified scan using DiscoveryService
router.post('/scan', async (req, res) => {
  try {
    if (process.env.SELECT_ENGINE) {
      const { engine, results } = await scanOnce();
      const discoveries = mapDiscoveries(results || [])
        .filter(d => d.price > 0)
        .filter(d => ['BUY', 'WATCHLIST', 'MONITOR'].includes(d.action));
      
      return res.json({
        success: true,
        engine,
        count: discoveries.length,
        discoveries
      });
    }
    
    // Fallback to job system when SELECT_ENGINE is unset
    const id = `scan-${Date.now()}`;
    const job = { id, status: 'queued', started: null, finished: null, error: null, candidates: 0, engine: null };
    jobs.set(id, job);
    lastJob = job;
    res.status(202).json({ success: true, job: id, count: 0 });

    setImmediate(async () => {
      const job = jobs.get(id);
      if (!job) return;
      job.status = 'running';
      job.started = new Date().toISOString();

      try {
        // Use unified DiscoveryService - single source of truth
        const { engine, results, metadata } = await scanOnce();
        job.status = 'done';
        job.finished = new Date().toISOString();
        job.candidates = results.length;
        job.engine = engine;
        job.metadata = metadata;
        
        console.log(`✅ Scan ${id} completed with engine '${engine}': ${results.length} discoveries`);
      } catch (e) {
        job.status = 'error';
        job.finished = new Date().toISOString();
        job.error = e.message;
        console.error(`❌ Scan ${id} failed:`, e);
      }
    });
  } catch (e) {
    const { key } = pickEngine();
    res.status(200).json({ 
      success: false, 
      engine: key, 
      discoveries: [], 
      error: e?.message 
    });
  }
});

// POST /api/discoveries/run -> unified run using DiscoveryService
router.post('/run', async (req, res) => {
  const id = `run-${Date.now()}`;
  const job = { id, status: 'queued', started: null, finished: null, error: null, candidates: 0, engine: null };
  jobs.set(id, job);
  lastJob = job;
  res.status(202).json({ success: true, job: id });

  setImmediate(async () => {
    const job = jobs.get(id);
    if (!job) return;
    job.status = 'running';
    job.started = new Date().toISOString();

    try {
      // Use unified DiscoveryService - single source of truth
      const { engine, results, metadata } = await scanOnce();
      job.status = 'done';
      job.finished = new Date().toISOString();
      job.candidates = results.length;
      job.engine = engine;
      job.metadata = metadata;
      
      console.log(`✅ Run ${id} completed with engine '${engine}': ${results.length} discoveries`);
    } catch (e) {
      job.status = 'error';
      job.finished = new Date().toISOString();
      job.error = e.message;
      console.error(`❌ Run ${id} failed:`, e);
    }
  });
});

// GET /api/discoveries/run/:job -> job status with engine info
router.get('/run/:job', (req, res) => {
  const job = jobs.get(req.params.job);
  if (!job) return res.status(404).json({ success: false, error: 'unknown job' });
  res.json({ 
    success: true, 
    job: { 
      id: job.id, 
      status: job.status, 
      candidates: job.candidates ?? 0, 
      error: job.error || null,
      engine: job.engine || null,
      metadata: job.metadata || null
    } 
  });
});

function safeParseJSON(x, fallback) {
  if (x == null) return fallback;
  if (x === 'undefined') return fallback;
  try { return JSON.parse(x); } catch { return fallback; }
}

// Uniform discovery data mapping for consistent frontend contract
function toUniformDiscovery(rawData) {
  // Handle both database rows and direct discovery objects
  const data = rawData.features_json ? safeParseJSON(rawData.features_json, {}) : rawData;
  const audit = rawData.audit_json ? safeParseJSON(rawData.audit_json, {}) : {};
  
  // Core identification
  const ticker = data.ticker || data.symbol || rawData.symbol;
  const price = safeNum(data.price || rawData.price, 0);
  
  // Skip invalid discoveries
  if (!ticker || price <= 0) return null;
  
  return {
    ticker,
    name: data.name || data.company || ticker,
    price,
    changePct: safeNum(data.changePct || data.price_change_1d_pct, null),
    
    // Volume metrics
    volumeX: safeNum(data.volumeX || data.intraday_rel_volume || data.technicals?.rel_volume, 1),
    volumeToday: safeNum(data.volumeToday || data.technicals?.volume, null),
    avgVolume: safeNum(data.avgVolume || data.technicals?.avg_volume_30d, null),
    
    // Short squeeze metrics with estimation tracking
    shortInterest: safeNum(data.short_interest_pct, null),
    shortInterestMethod: data.short_interest_method || 'unknown',
    shortInterestConfidence: safeNum(data.short_interest_confidence, 1.0),
    daysToCover: safeNum(data.days_to_cover, null),
    borrowFee: safeNum(data.borrow_fee_pct, null),
    utilization: safeNum(data.utilization_pct, null),
    
    // Float and liquidity
    floatShares: safeNum(data.float_shares, null),
    liquidity: safeNum(data.avg_dollar_liquidity_30d, null),
    
    // Scoring
    score: safeNum(data.composite_score || rawData.score, 0),
    scoreConfidence: safeNum(data.score_confidence || audit.composite_confidence, 1.0),
    action: data.action || rawData.action || 'MONITOR',
    
    // Options flow
    options: {
      callPutRatio: safeNum(data.options?.callPut || data.options?.call_put_ratio, null),
      ivPercentile: safeNum(data.options?.ivPercentile || data.options?.iv_percentile, null),
      gammaExposure: safeNum(data.options?.gamma || data.options?.gammaExposure, null)
    },
    
    // Technical indicators
    technicals: {
      vwap: safeNum(data.technicals?.vwap, null),
      ema9: safeNum(data.technicals?.ema9, null),
      ema20: safeNum(data.technicals?.ema20, null),
      rsi: safeNum(data.technicals?.rsi, null),
      atrPct: safeNum(data.technicals?.atr_pct || data.technicals?.atrPct, null)
    },
    
    // Catalyst information
    catalyst: data.catalyst ? {
      type: data.catalyst.type || 'unknown',
      description: data.catalyst.description || data.catalyst.title || '',
      confidence: safeNum(data.catalyst.confidence, 0.5)
    } : null,
    
    // Sentiment
    sentiment: {
      score: safeNum(data.sentiment?.score, null),
      sources: Array.isArray(data.sentiment?.sources) ? data.sentiment.sources : []
    },
    
    // Entry and risk management
    entryHint: data.entry_hint ? {
      type: data.entry_hint.type || 'breakout',
      triggerPrice: safeNum(data.entry_hint.trigger_price, price)
    } : null,
    
    risk: data.risk ? {
      stopLoss: safeNum(data.risk.stop_loss, price * 0.9),
      takeProfit1: safeNum(data.risk.tp1, price * 1.2),
      takeProfit2: safeNum(data.risk.tp2, price * 1.5)
    } : null,
    
    // Metadata
    discoveredAt: rawData.created_at || data.ts || new Date().toISOString(),
    discoveryMethod: data.discovery_method || 'legacy',
    estimatedData: !!data.estimated_data,
    dataQuality: data.data_quality || {},
    
    // Backwards compatibility fields
    currentPrice: price,
    similarity: Math.min(safeNum(data.composite_score || rawData.score, 0) / 100, 1.0),
    confidence: Math.min(safeNum(data.score_confidence, 1.0), 1.0),
    viglScore: Math.min(safeNum(data.composite_score || rawData.score, 0) / 100, 1.0),
    recommendation: data.action || rawData.action || 'MONITOR',
    isHighConfidence: safeNum(data.composite_score || rawData.score, 0) >= 75
  };
}

// GET /api/discoveries/latest - Get latest discoveries using unified service
router.get('/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const rows = await topDiscoveries(Math.min(limit, 200)); // Use unified service
    
    const discoveries = mapDiscoveries(rows) // Use safe mapper
      .filter(d => d.price > 0) // Remove invalid entries
      .filter(d => ['BUY', 'WATCHLIST', 'MONITOR'].includes(d.action)) // Only actionable items
      .sort((a, b) => b.score - a.score); // Sort by score descending
    
    const engineInfo = getEngineInfo();
    
    res.json({ 
      success: true, 
      discoveries,
      count: discoveries.length,
      lastUpdated: new Date().toISOString(),
      engine: engineInfo.active_engine
    });
  } catch (e) {
    console.error('Latest discoveries error:', e);
    // Never return 500 - always provide empty result for UI stability
    res.json({ 
      success: false, 
      discoveries: [],
      count: 0,
      error: e.message,
      lastUpdated: new Date().toISOString(),
      engine: 'error'
    });
  }
});

// GET /api/discoveries/top - Legacy endpoint for backward compatibility
router.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const rows = await db.getLatestDiscoveriesForEngine(Math.min(limit, 50));
    
    const discoveries = rows
      .map(r => toUniformDiscovery(r))
      .filter(d => d !== null && d.price > 0)
      .filter(d => ['BUY', 'WATCHLIST', 'MONITOR'].includes(d.action))
      .sort((a, b) => b.score - a.score)
      .map(d => ({
        // Legacy format mapping
        symbol: d.ticker,
        name: d.name,
        currentPrice: d.price,
        marketCap: d.floatShares ? d.floatShares * d.price : 100000000,
        volumeSpike: d.volumeX,
        momentum: d.changePct || 0,
        breakoutStrength: d.viglScore,
        sector: 'Technology', // Default sector
        catalysts: d.catalyst ? [d.catalyst.type] : ['Pattern match'],
        similarity: d.similarity,
        confidence: d.confidence,
        isHighConfidence: d.isHighConfidence,
        estimatedUpside: d.score >= 75 ? '100-200%' : d.score >= 60 ? '50-100%' : '25-50%',
        discoveredAt: d.discoveredAt,
        riskLevel: d.score >= 70 ? 'MODERATE' : 'HIGH',
        recommendation: d.action,
        viglScore: d.viglScore
      }));
    
    res.json({
      success: true,
      count: discoveries.length,
      discoveries
    });
  } catch (error) {
    console.error('Error fetching top discoveries:', error);
    res.json({
      success: false,
      error: error.message,
      count: 0,
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

// Dashboard endpoint for frontend compatibility - returns discoveries in dashboard format
router.get('/dashboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const rows = await db.getLatestDiscoveriesForEngine(Math.min(limit, 100));
    
    const discoveries = rows
      .map(r => toUniformDiscovery(r))
      .filter(d => d !== null && d.price > 0)
      .filter(d => ['BUY', 'WATCHLIST', 'MONITOR'].includes(d.action))
      .sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      discoveries,
      count: discoveries.length,
      lastUpdated: new Date().toISOString(),
      summary: {
        viglOpportunities: discoveries.length,
        highConfidence: discoveries.filter(d => d.isHighConfidence).length,
        buySignals: discoveries.filter(d => d.action === 'BUY').length,
        watchlistItems: discoveries.filter(d => d.action === 'WATCHLIST').length,
        avgScore: discoveries.length > 0 ? 
          Math.round(discoveries.reduce((sum, d) => sum + d.score, 0) / discoveries.length) : 0,
        estimatedDataCount: discoveries.filter(d => d.estimatedData).length
      }
    });
  } catch (error) {
    console.error('Dashboard endpoint error:', error);
    // Never return 500 to maintain UI stability
    res.json({ 
      success: false, 
      error: error.message,
      discoveries: [],
      count: 0,
      lastUpdated: new Date().toISOString(),
      summary: { 
        viglOpportunities: 0, 
        highConfidence: 0,
        buySignals: 0,
        watchlistItems: 0,
        avgScore: 0,
        estimatedDataCount: 0
      }
    });
  }
});

module.exports = router;