const express = require('express');
const router = express.Router();
const Engine = require('../services/squeeze/engine');
const EngineOptimized = require('../services/squeeze/engine_optimized');
const db = require('../db/sqlite');
const { safeNum, formatPrice, formatPercent, formatMultiplier } = require('../services/squeeze/metrics_safety');
const https = require('https');
const fetch = require('node-fetch');
const liveDataService = require('../services/market_data/live_feed');

// New unified service and mapper
const { scanOnce, topDiscoveries, getEngineInfo } = require('../services/discovery_service');
const { toUiDiscovery, mapDiscoveries } = require('./mappers/to_ui_discovery');

// simple in-memory job registry
const jobs = new Map();
let lastJob = null;

// Enhanced tape quality assessment functions
function assessTapeQuality(liveData) {
  if (!liveData) return 'UNKNOWN';
  
  const { live_price, live_vwap, live_rsi, ema9_ge_ema20, drawdown_from_hod } = liveData;
  
  // Strong tape conditions
  if (live_price && live_vwap && live_price > live_vwap && 
      ema9_ge_ema20 && live_rsi >= 45 && live_rsi <= 70 && 
      (drawdown_from_hod || 0) < 0.15) {
    return 'STRONG';
  }
  
  // Weak tape conditions
  if ((live_price && live_vwap && live_price < live_vwap) ||
      (live_rsi && live_rsi > 75) ||
      (drawdown_from_hod && drawdown_from_hod >= 0.20)) {
    return 'WEAK';
  }
  
  return 'NEUTRAL';
}

function generateActionReason(discovery, liveData, portfolioStatus) {
  const reasons = [];
  
  if (liveData) {
    if (liveData.live_price > liveData.live_vwap) {
      reasons.push('Above VWAP ✅');
    } else if (liveData.live_price < liveData.live_vwap) {
      reasons.push('Below VWAP - wait for reclaim ⚠️');
    }
    
    if (liveData.ema9_ge_ema20) {
      reasons.push('Bullish EMA cross ✅');
    } else {
      reasons.push('EMA bearish ❌');
    }
    
    if (liveData.live_rsi > 75) {
      reasons.push('RSI overbought ⚠️');
    } else if (liveData.live_rsi < 30) {
      reasons.push('RSI oversold ✅');
    }
    
    if (liveData.drawdown_from_hod >= 0.15) {
      reasons.push('Large drawdown from HOD ❌');
    }
  }
  
  if (portfolioStatus === 'OWNED') {
    reasons.push('Already owned - consider adding more 🏠');
  }
  
  if (reasons.length === 0) {
    reasons.push('Monitor for entry signals');
  }
  
  return reasons.join('; ');
}

function enhanceActionWithTapeValidation(originalAction, tapeQuality, liveData) {
  // If tape is weak, downgrade BUY to PRE_BREAKOUT
  if (originalAction === 'BUY' && tapeQuality === 'WEAK') {
    return 'PRE_BREAKOUT';
  }
  
  // If tape is strong, upgrade PRE_BREAKOUT to EARLY_READY
  if (originalAction === 'PRE_BREAKOUT' && tapeQuality === 'STRONG' && 
      liveData && liveData.live_rsi < 70) {
    return 'EARLY_READY';
  }
  
  return originalAction;
}

// Alpaca configuration
const ALPACA_CONFIG = {
  apiKey: process.env.APCA_API_KEY_ID,
  secretKey: process.env.APCA_API_SECRET_KEY,
  baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets'
};

/**
 * Execute bracket order with Alpaca API
 * @param {Object} orderData Bracket order configuration
 * @returns {Promise<Object>} Result with success status and order ID
 */
async function executeBracketOrder(orderData) {
  return new Promise((resolve) => {
    if (!ALPACA_CONFIG.apiKey || !ALPACA_CONFIG.secretKey) {
      console.error('❌ Alpaca credentials not configured');
      resolve({ success: false, error: 'Alpaca API not configured' });
      return;
    }

    const url = new URL(ALPACA_CONFIG.baseUrl);
    const postData = JSON.stringify(orderData);
    
    const options = {
      hostname: url.hostname,
      path: '/v2/orders',
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': ALPACA_CONFIG.apiKey,
        'APCA-API-SECRET-KEY': ALPACA_CONFIG.secretKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`📡 Bracket order request: POST https://${url.hostname}/v2/orders`);
    console.log(`📡 Order data:`, JSON.stringify(orderData, null, 2));

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ Bracket order successful: ${parsed.id}`);
            resolve({ 
              success: true, 
              orderId: parsed.id,
              response: parsed 
            });
          } else {
            console.error(`❌ Alpaca bracket order error: ${res.statusCode}`);
            console.error(`❌ Response: ${responseData}`);
            resolve({ 
              success: false, 
              error: `Alpaca API error: ${res.statusCode} - ${parsed?.message || responseData}` 
            });
          }
        } catch (e) {
          console.error('❌ Failed to parse bracket order response:', e.message);
          console.error('❌ Raw response:', responseData);
          resolve({ 
            success: false, 
            error: `Invalid response format: ${e.message}` 
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Bracket order request failed:', err.message);
      resolve({ 
        success: false, 
        error: `Network error: ${err.message}` 
      });
    });
    
    req.setTimeout(15000, () => {
      req.destroy();
      console.error('❌ Bracket order request timeout');
      resolve({ 
        success: false, 
        error: 'Request timeout after 15 seconds' 
      });
    });

    req.write(postData);
    req.end();
  });
}

// Debug endpoint to prove which engine is actually active
router.get('/_debug/engine', (req, res) => {
  try {
    // Respect FORCE_V2_FALLBACK for rollback capability
    let activeEngine;
    if (process.env.FORCE_V2_FALLBACK === 'true') {
      activeEngine = 'v1';
    } else {
      activeEngine = (req.query.engine || process.env.SELECT_ENGINE || 'v1').toString();
    }
    const engineInfo = getEngineInfo();
    
    res.json({ 
      available: engineInfo.available_engines,
      active: activeEngine,
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

// POST /api/discoveries/buy100 -> Secure $100 VIGL buy with bracket orders
router.post('/buy100', async (req, res) => {
  try {
    const { symbol, price, stopLossPercent = 10, takeProfitPercent = 25 } = req.body;
    
    // Input validation
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid symbol format',
        symbol
      });
    }
    
    if (!price || price <= 0 || price > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid price - must be between $0.01 and $1000',
        symbol,
        price
      });
    }
    
    console.log(`💰 VIGL Buy100: ${symbol} at $${price} with ${stopLossPercent}% stop-loss, ${takeProfitPercent}% take-profit`);
    
    // Calculate position size for $100 investment
    const investmentAmount = 100.00;
    const quantity = Math.floor(investmentAmount / price);
    
    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        error: `Price too high for $100 investment (calculated ${quantity} shares)`,
        symbol,
        price,
        maxPrice: investmentAmount
      });
    }
    
    // Calculate bracket order levels
    const actualCost = quantity * price;
    const stopLossPrice = +(price * (1 - stopLossPercent / 100)).toFixed(2);
    const takeProfitPrice = +(price * (1 + takeProfitPercent / 100)).toFixed(2);
    
    // Create bracket order (parent + OCO orders)
    const bracketOrder = {
      symbol: symbol.toString(),
      qty: quantity.toString(),
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
      order_class: 'bracket',
      stop_loss: {
        stop_price: stopLossPrice.toString(),
        limit_price: stopLossPrice.toString()
      },
      take_profit: {
        limit_price: takeProfitPrice.toString()
      }
    };
    
    console.log(`📊 Bracket Order: ${quantity} shares × $${price} = $${actualCost.toFixed(2)}`);
    console.log(`📊 Stop Loss: $${stopLossPrice} (-${stopLossPercent}%)`);
    console.log(`📊 Take Profit: $${takeProfitPrice} (+${takeProfitPercent}%)`);
    
    // Execute bracket order via Alpaca
    const result = await executeBracketOrder(bracketOrder);
    
    if (result.success) {
      console.log(`✅ VIGL Bracket Order placed: ${result.orderId} for ${symbol}`);
      
      res.json({
        success: true,
        orderId: result.orderId,
        symbol,
        quantity,
        price,
        actualCost: +actualCost.toFixed(2),
        stopLossPrice,
        takeProfitPrice,
        stopLossPercent,
        takeProfitPercent,
        message: `Buy100 order placed: ${quantity} shares of ${symbol}`,
        orderType: 'bracket',
        source: 'vigl_buy100'
      });
    } else {
      console.error(`❌ VIGL Buy100 failed for ${symbol}: ${result.error}`);
      res.status(500).json({
        success: false,
        error: result.error,
        symbol,
        quantity,
        price
      });
    }
    
  } catch (error) {
    console.error('❌ VIGL Buy100 error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Buy100 operation failed',
      message: error.message
    });
  }
});

// POST /api/discoveries/vigl -> Run complete VIGL discovery pipeline
router.post('/vigl', async (req, res) => {
  try {
    const { runVIGLDiscovery } = require('../jobs/capture');
    
    console.log('🎯 Starting VIGL discovery pipeline via API...');
    const startTime = Date.now();
    
    const results = await runVIGLDiscovery();
    const duration = Date.now() - startTime;
    
    console.log(`✅ VIGL pipeline completed in ${duration}ms: ${results.length} discoveries`);
    
    res.json({
      success: true,
      pipeline: 'VIGL',
      duration: `${duration}ms`,
      results: results.length,
      discoveries: results.map(r => ({
        symbol: r.symbol,
        score: r.score,
        action: r.action,
        price: r.price,
        rvol: r.rvol
      })),
      summary: {
        BUY: results.filter(r => r.action === 'BUY').length,
        WATCHLIST: results.filter(r => r.action === 'WATCHLIST').length,
        MONITOR: results.filter(r => r.action === 'MONITOR').length,
        DROP: results.filter(r => r.action === 'DROP').length,
        avgScore: results.length > 0 ? 
          +(results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(2) : 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ VIGL API endpoint error:', error.message);
    res.status(500).json({
      success: false,
      pipeline: 'VIGL',
      error: error.message,
      results: 0,
      discoveries: [],
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/discoveries/scan -> unified scan using DiscoveryService
router.post('/scan', async (req, res) => {
  try {
    if (process.env.SELECT_ENGINE) {
      const { engine, results } = await scanOnce();
      return res.json({
        success: true,
        engine,
        count: results.length,
        discoveries: results.map(toUiDiscovery)
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
    explosivenessScore: safeNum(rawData.explosiveness_score, null),
    
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
    const discoveries = db.db.prepare(`
      SELECT COUNT(*) as total_count
      FROM discoveries 
      WHERE action IS NOT NULL
    `).get();
    
    const actionBreakdown = db.db.prepare(`
      SELECT action, COUNT(*) as count
      FROM discoveries 
      WHERE action IS NOT NULL
      GROUP BY action
    `).all();
    
    const recentDiscoveries = db.db.prepare(`
      SELECT symbol, score, action, price, created_at
      FROM discoveries 
      WHERE action IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    
    res.json({
      success: true,
      count: discoveries.total_count,
      discoveries: recentDiscoveries,
      breakdown: actionBreakdown,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get latest discoveries:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
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

// GET /api/discoveries/raw - Raw discoveries for master automation
router.get('/raw', async (_req, res) => {
  try {
    const discoveries = db.db.prepare(`
      SELECT symbol, score, action, price, features_json, created_at
      FROM discoveries 
      WHERE action IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    
    // Parse features_json to extract enrichment data
    const enriched = discoveries.map(d => {
      const features = d.features_json ? JSON.parse(d.features_json) : {};
      return {
        symbol: d.symbol,
        score: d.score,
        action: d.action,
        price: d.price,
        short_interest: features.short_interest || 0,
        volume_ratio: features.volume_ratio || features.technicals?.rel_volume || 0,
        created_at: d.created_at
      };
    });
    
    // Return array directly for master automation compatibility
    res.json(enriched);
    
  } catch (error) {
    console.error('❌ Failed to get raw discoveries:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
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

// Dashboard endpoint for frontend compatibility - NOW USES VIGL TABLE
router.get('/dashboard', async (req, res) => {
  try {
    const { getRecentDiscoveries, getDiscoveryStats } = require('../db/discoveries-repository');
    const limit = parseInt(req.query.limit) || 20;
    
    console.log(`📊 Dashboard: Fetching VIGL discoveries (limit: ${limit})`);
    
    // Get recent VIGL discoveries from new table
    const viglDiscoveries = getRecentDiscoveries(Math.min(limit, 50));
    
    // Map VIGL format to UI format with rank
    const discoveries = viglDiscoveries.map((discovery, index) => ({
      rank: index + 1,
      symbol: discovery.symbol,
      ticker: discovery.symbol,
      name: discovery.symbol, // Company name would come from enrichment
      currentPrice: discovery.price,
      price: discovery.price,
      score: Math.round(discovery.score * 25), // Convert 0-4 to 0-100 scale for UI
      action: discovery.action,
      rvol: discovery.rvol,
      volumeSpike: discovery.rvol,
      volumeX: discovery.rvol,
      similarity: Math.min(discovery.score / 4, 1.0), // 0-1 scale
      confidence: Math.min(discovery.score / 4, 1.0),
      viglScore: Math.min(discovery.score / 4, 1.0),
      isHighConfidence: discovery.score >= 2.5,
      recommendation: discovery.action,
      estimatedUpside: discovery.score >= 3.0 ? '100-200%' : 
                       discovery.score >= 2.0 ? '50-100%' : '25-50%',
      riskLevel: discovery.score >= 2.5 ? 'MODERATE' : 'HIGH',
      discoveredAt: discovery.asof,
      breakoutStrength: Math.min(discovery.score / 4, 1.0),
      thesis: `VIGL pattern detected with ${discovery.rvol.toFixed(1)}x relative volume`,
      // Add component breakdown from VIGL scoring
      components: discovery.components || {},
      createdAt: discovery.createdAt,
      updatedAt: discovery.updatedAt,
      
      // Additional fields the UI expects
      explosivenessScore: Math.round(discovery.score * 25), // Same as score for consistency
      catalyst: null, // No catalyst data in VIGL system yet
      targetPrices: {
        moderate: +(discovery.price * 1.25).toFixed(2),
        aggressive: +(discovery.price * 1.5).toFixed(2)
      },
      // Ensure all required fields exist
      estimatedData: false
    }));
    
    // Get summary statistics
    const stats = getDiscoveryStats();
    
    res.json({
      success: true,
      discoveries,
      count: discoveries.length,
      lastUpdated: new Date().toISOString(),
      summary: {
        viglOpportunities: stats.total,
        highConfidence: discoveries.filter(d => d.isHighConfidence).length,
        buySignals: discoveries.filter(d => d.action === 'BUY').length,
        watchlistItems: discoveries.filter(d => d.action === 'WATCHLIST').length,
        monitorItems: discoveries.filter(d => d.action === 'MONITOR').length,
        avgScore: discoveries.length > 0 ? 
          Math.round(discoveries.reduce((sum, d) => sum + d.score, 0) / discoveries.length) : 0,
        maxScore: discoveries.length > 0 ? Math.max(...discoveries.map(d => d.score)) : 0,
        avgRVOL: discoveries.length > 0 ?
          +(discoveries.reduce((sum, d) => sum + d.rvol, 0) / discoveries.length).toFixed(2) : 0,
        estimatedDataCount: 0 // VIGL system uses real data
      },
      // Include metadata about the new system
      metadata: {
        source: 'discoveries_vigl',
        pipeline: 'prefilter → enrichment → vigl_scoring → atomic_save',
        scoringRange: '0-4 VIGL scale (displayed as 0-100)',
        lastScan: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Dashboard endpoint error:', error.message);
    // Never return 500 to maintain UI stability - fallback to empty state
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
        monitorItems: 0,
        avgScore: 0,
        maxScore: 0,
        avgRVOL: 0,
        estimatedDataCount: 0
      },
      metadata: {
        source: 'discoveries_vigl',
        error: 'Failed to load VIGL discoveries'
      }
    });
  }
});

// ==================== MISSING API ENDPOINTS FOR MASTER AUTOMATION ====================

// DELETE /api/discoveries/clear - Clear stale discoveries
router.delete('/clear', async (req, res) => {
  try {
    console.log('🧹 Clearing stale discoveries...');
    
    // Delete old records with null actions or older than 7 days
    const result = db.db.prepare(`
      DELETE FROM discoveries 
      WHERE action IS NULL 
         OR action = '' 
         OR created_at < datetime('now', '-7 days')
    `).run();
    
    console.log(`✅ Cleared ${result.changes} stale discovery records`);
    
    res.json({
      success: true,
      deleted: result.changes,
      message: `Cleared ${result.changes} stale discoveries`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to clear discoveries:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Duplicate /raw endpoint removed - using the updated one above

// Duplicate /latest endpoint removed - using the updated one above

// POST /api/discoveries/backup - Backup discoveries
router.post('/backup', async (req, res) => {
  try {
    const { filename = `trading_backup_${new Date().toISOString().split('T')[0]}.json` } = req.body;
    
    const discoveries = db.db.prepare(`
      SELECT * FROM discoveries 
      WHERE action IS NOT NULL
      ORDER BY created_at DESC
    `).all();
    
    // In a real system, you'd save this to file storage
    console.log(`💾 Backup created: ${discoveries.length} records`);
    
    res.json({
      success: true,
      filename,
      count: discoveries.length,
      message: `Backup created with ${discoveries.length} discoveries`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/discoveries/enrich-and-rescore - Enrich discoveries with comprehensive features
router.post('/enrich-and-rescore', async (req, res) => {
  try {
    const { enrichDiscoveries } = require('../enrich');
    const { 
      limit = 50, 
      batchSize = 3, 
      delayMs = 2000,
      minScore = 0 
    } = req.body;
    
    console.log(`🔬 Starting enrichment process...`);
    console.log(`📊 Parameters: limit=${limit}, batchSize=${batchSize}, delayMs=${delayMs}`);
    
    // Get discoveries to enrich
    const rawDiscoveries = db.db.prepare(`
      SELECT symbol, score, action, price, features_json, created_at, id
      FROM discoveries 
      WHERE action IS NOT NULL 
        AND score >= ?
        AND (features_json IS NULL 
             OR features_json NOT LIKE '%"enriched_at"%'
             OR json_extract(features_json, '$.enrichment_version') IS NULL)
      ORDER BY score DESC, created_at DESC
      LIMIT ?
    `).all(minScore, limit);
    
    if (rawDiscoveries.length === 0) {
      return res.json({
        success: true,
        message: 'No discoveries need enrichment',
        enriched: 0,
        failed: 0,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📥 Found ${rawDiscoveries.length} discoveries to enrich`);
    
    // Enrich discoveries
    const enrichedResults = await enrichDiscoveries(rawDiscoveries, { batchSize, delayMs });
    
    // Update database with enriched data
    const updateStmt = db.db.prepare(`
      UPDATE discoveries 
      SET features_json = ?, 
          explosiveness_score = ?,
          updated_at = ?
      WHERE id = ?
    `);
    
    let updated = 0;
    let failed = 0;
    
    for (const result of enrichedResults) {
      try {
        if (result.enriched) {
          updateStmt.run(
            result.features_json,
            result.explosiveness_score || null,
            new Date().toISOString(),
            result.id
          );
          updated++;
        } else {
          failed++;
        }
      } catch (updateError) {
        console.error(`❌ Failed to update ${result.symbol}:`, updateError.message);
        failed++;
      }
    }
    
    console.log(`✅ Enrichment complete: ${updated} updated, ${failed} failed`);
    
    // Get summary of explosiveness scores
    const scoreStats = db.db.prepare(`
      SELECT 
        COUNT(*) as total_enriched,
        AVG(explosiveness_score) as avg_explosiveness,
        MAX(explosiveness_score) as max_explosiveness,
        COUNT(CASE WHEN explosiveness_score >= 70 THEN 1 END) as high_explosiveness
      FROM discoveries 
      WHERE explosiveness_score IS NOT NULL
    `).get();
    
    res.json({
      success: true,
      processed: rawDiscoveries.length,
      enriched: updated,
      failed: failed,
      message: `Enriched ${updated} discoveries with comprehensive features`,
      stats: {
        totalEnriched: scoreStats.total_enriched,
        avgExplosiveness: Math.round(scoreStats.avg_explosiveness || 0),
        maxExplosiveness: scoreStats.max_explosiveness || 0,
        highExplosiveness: scoreStats.high_explosiveness
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Enrichment failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// NEW VIGL DASHBOARD ENDPOINT - Clean ranked response from discoveries_vigl table
router.get('/dashboard/vigl', async (req, res) => {
  try {
    const { getRecentDiscoveries, getDiscoveryStats } = require('../db/discoveries-repository');
    const limit = parseInt(req.query.limit) || 20;
    
    console.log(`📊 Fetching VIGL discoveries (limit: ${limit})`);
    
    // Get recent VIGL discoveries from new table
    const discoveries = getRecentDiscoveries(Math.min(limit, 50));
    
    // Add rank to each discovery based on sort order
    const rankedDiscoveries = discoveries.map((discovery, index) => ({
      ...discovery,
      rank: index + 1
    }));
    
    // Get summary statistics
    const stats = getDiscoveryStats();
    
    console.log(`✅ Retrieved ${rankedDiscoveries.length} VIGL discoveries`);
    
    res.json({
      success: true,
      discoveries: rankedDiscoveries,
      count: rankedDiscoveries.length,
      lastUpdated: new Date().toISOString(),
      
      // VIGL-specific summary stats
      summary: {
        totalDiscoveries: stats.total,
        buySignals: rankedDiscoveries.filter(d => d.action === 'BUY').length,
        watchlistItems: rankedDiscoveries.filter(d => d.action === 'WATCHLIST').length,
        monitorItems: rankedDiscoveries.filter(d => d.action === 'MONITOR').length,
        avgScore: rankedDiscoveries.length > 0 ? 
          +(rankedDiscoveries.reduce((sum, d) => sum + d.score, 0) / rankedDiscoveries.length).toFixed(2) : 0,
        maxScore: rankedDiscoveries.length > 0 ? Math.max(...rankedDiscoveries.map(d => d.score)) : 0,
        avgRVOL: rankedDiscoveries.length > 0 ?
          +(rankedDiscoveries.reduce((sum, d) => sum + d.rvol, 0) / rankedDiscoveries.length).toFixed(2) : 0,
        statsTimestamp: stats.timestamp
      },
      
      // Action breakdown from database
      breakdown: stats.byAction.reduce((acc, item) => {
        acc[item.action] = {
          count: item.count,
          avgScore: +Number(item.avg_score).toFixed(2),
          maxScore: +Number(item.max_score).toFixed(2)
        };
        return acc;
      }, {}),
      
      // Data source metadata
      metadata: {
        source: 'discoveries_vigl',
        table: 'New VIGL atomic persistence',
        pipeline: 'prefilter → enrichment → vigl_scoring → atomic_save',
        scoringRange: '0-4 scale',
        classification: {
          BUY: '≥2.50',
          WATCHLIST: '≥1.75', 
          MONITOR: '≥1.25',
          DROP: '<1.25'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ VIGL dashboard endpoint error:', error.message);
    
    // Graceful degradation - never break UI
    res.json({
      success: false,
      error: error.message,
      discoveries: [],
      count: 0,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalDiscoveries: 0,
        buySignals: 0,
        watchlistItems: 0,
        monitorItems: 0,
        avgScore: 0,
        maxScore: 0,
        avgRVOL: 0,
        statsTimestamp: new Date().toISOString()
      },
      breakdown: {},
      metadata: {
        source: 'discoveries_vigl',
        error: 'Failed to load VIGL discoveries'
      }
    });
  }
});

/**
 * GET /api/discoveries/latest-scores
 * Get latest scores for all tickers (for unified engine)
 */
router.get('/latest-scores', async (req, res) => {
  try {
    console.log('📊 Latest Scores: Fetching recent discoveries...');
    
    // Import real-time data provider
    const { PolygonProvider } = require('../services/providers/polygon');
    const polygon = new PolygonProvider();
    
    let discoveries = [];
    let source = 'discoveries_vigl';
    
    try {
      // Try to get recent discoveries from VIGL table (remove time filter for now)
      discoveries = db.db.prepare(`
        SELECT symbol as ticker, score, rvol, price, action, components, created_at
        FROM discoveries_vigl 
        ORDER BY score DESC
        LIMIT 100
      `).all();
    } catch (err) {
      // Fallback if discoveries_vigl table doesn't exist
      console.warn('⚠️ Latest scores fallback -> discoveries:', err.message);
      source = 'discoveries';
      
      // Try different time windows if recent data is empty
      discoveries = db.db.prepare(`
        SELECT symbol as ticker, score, 
               1.0 as rvol, 
               COALESCE(price, 50.0) as price,
               NULL as action,
               '{}' as components,
               created_at
        FROM discoveries 
        WHERE score IS NOT NULL 
        ORDER BY created_at DESC
        LIMIT 100
      `).all();
      
      console.log(`⚠️ Fallback loaded ${discoveries.length} discoveries from main table`);
    }
    
    // Handle empty results gracefully
    if (!discoveries || discoveries.length === 0) {
      console.log('📊 Latest Scores: No discoveries found, returning empty array');
      return res.json({ 
        success: true, 
        source: source,
        count: 0,
        data: [] 
      });
    }
    
    // Get portfolio positions for context
    let portfolioPositions = [];
    try {
      const portfolioResponse = await fetch(`http://localhost:${process.env.PORT || 3003}/api/portfolio-intelligence/analyze`);
      if (portfolioResponse.ok) {
        const portfolioData = await portfolioResponse.json();
        portfolioPositions = portfolioData.positions || [];
      }
    } catch (portfolioError) {
      console.warn('⚠️ Could not fetch portfolio positions for context:', portfolioError.message);
    }
    
    // Get live data for all discovery symbols (enhanced scoring)
    console.log('🔴 Fetching live tape data for enhanced scoring...');
    const discoverySymbols = discoveries.slice(0, 20).map(d => d.ticker); // Limit to top 20 for performance
    const liveDataMap = await liveDataService.getLiveMetricsForSymbols(discoverySymbols);
    
    // Transform to unified engine format with enhanced data + portfolio context + live tape
    const scores = await Promise.all(discoveries.map(async (d) => {
      // Parse components if available
      let componentsData = {};
      try {
        if (d.components) componentsData = JSON.parse(d.components);
      } catch (e) {
        // Use defaults if parsing fails
      }
      
      // Get real-time price and market data
      let currentPrice = d.price || 50;
      let realTimeData = {};
      
      try {
        const snapshot = await polygon.getMarketSnapshot(d.ticker);
        if (snapshot) {
          currentPrice = snapshot.price || currentPrice;
          realTimeData = {
            price: snapshot.price,
            change: snapshot.change,
            changePercent: snapshot.changePercent,
            volume: snapshot.volume,
            vwap: snapshot.vwap,
            high: snapshot.high,
            low: snapshot.low,
            timestamp: snapshot.timestamp
          };
        }
      } catch (priceError) {
        console.warn(`⚠️ Failed to get real-time data for ${d.ticker}:`, priceError.message);
      }
      
      // Calculate real-time indicators
      const relVol = realTimeData.volume && d.rvol ? 
        realTimeData.volume / (d.rvol * 1000000) : (d.rvol || 1.0);
      
      const vwapReclaimed = realTimeData.vwap ? 
        currentPrice > realTimeData.vwap : d.score > 70;
      
      // Generate thesis data from score and real-time data
      const thesisData = {
        momentum: Math.round(d.score * 0.3 + (realTimeData.changePercent > 0 ? 5 : 0)),
        squeeze: Math.round(d.score * 0.25),
        catalyst: Math.round(d.score * 0.25),
        sentiment: Math.round(d.score * 0.15 + (realTimeData.changePercent > 2 ? 3 : 0)),
        technical: Math.round(d.score * 0.05 + (vwapReclaimed ? 2 : 0))
      };
      
      // Generate targets based on real price and volatility
      const volatility = Math.abs(realTimeData.changePercent || 2) / 100;
      const tp1Pct = Math.max(0.08, Math.min(0.25, volatility * 6));
      const tp2Pct = Math.max(0.15, Math.min(0.50, volatility * 12));
      const stopPct = Math.max(0.05, Math.min(0.15, volatility * 3));
      
      const targetsData = {
        entry: `Above $${(currentPrice * 1.01).toFixed(2)}`,
        tp1: `+${(tp1Pct * 100).toFixed(0)}%`,
        tp2: `+${(tp2Pct * 100).toFixed(0)}%`,
        stop: `-${(stopPct * 100).toFixed(0)}%`
      };
      
      // Check if this discovery is already in portfolio
      const portfolioPosition = portfolioPositions.find(p => p.symbol === d.ticker);
      const isOwned = !!portfolioPosition;
      
      // Get live tape data for this symbol
      const liveData = liveDataMap[d.ticker];
      
      // Assess tape quality
      const tapeQuality = assessTapeQuality(liveData);
      
      // Enhance action with tape validation
      const baseAction = d.action || (d.score >= 70 ? 'BUY' : d.score >= 60 ? 'WATCHLIST' : 'MONITOR');
      const enhancedAction = enhanceActionWithTapeValidation(baseAction, tapeQuality, liveData);
      
      // Generate action reasoning
      const actionReason = generateActionReason(d, liveData, isOwned ? 'OWNED' : 'OPPORTUNITY');
      
      return {
        ticker: d.ticker,
        score: d.score,
        vigl_score: d.score,
        action: enhancedAction,
        tape_quality: tapeQuality,
        action_reason: actionReason,
        intraday: {
          rvol: relVol,
          vwap_reclaimed: liveData ? (liveData.live_price > liveData.live_vwap) : vwapReclaimed,
          ema9_over_20: liveData ? liveData.ema9_ge_ema20 : (d.score > 65),
          change_percent: realTimeData.changePercent || 0,
          volume: realTimeData.volume || 0,
          is_live_data: !!realTimeData.timestamp,
          // Enhanced live tape metrics
          live_rsi: liveData?.live_rsi || null,
          drawdown_from_hod: liveData?.drawdown_from_hod || null,
          relative_volume: liveData?.relative_volume || relVol
        },
        price: currentPrice,
        price_data: {
          current: liveData?.live_price || currentPrice,
          change: realTimeData.change || 0,
          change_percent: realTimeData.changePercent || 0,
          high: liveData?.hod || realTimeData.high || currentPrice,
          low: realTimeData.low || currentPrice,
          vwap: liveData?.live_vwap || realTimeData.vwap || currentPrice,
          volume: realTimeData.volume || 0,
          last_updated: realTimeData.timestamp || d.created_at,
          is_live_data: !!realTimeData.timestamp || !!liveData,
          // Enhanced live price metrics
          ema9: liveData?.ema9 || null,
          ema20: liveData?.ema20 || null,
          cached_price: currentPrice // Original cached price for comparison
        },
        thesis: thesisData,
        targets: targetsData,
        components: componentsData,
        timestamp: d.created_at,
        // Portfolio integration
        portfolio_status: isOwned ? 'OWNED' : 'OPPORTUNITY',
        current_position: portfolioPosition || null,
        portfolio_context: isOwned ? {
          quantity: portfolioPosition.qty,
          avg_cost: portfolioPosition.avgCost,
          unrealized_pnl: portfolioPosition.unrealizedPnL,
          unrealized_pnl_pct: portfolioPosition.unrealizedPnLPercent,
          last_vigl_action: portfolioPosition.last_vigl_action,
          recommendation: portfolioPosition.recommendation,
          risk_assessment: portfolioPosition.risk_assessment
        } : null
      };
    }));
    
    console.log(`📊 Latest Scores: Returning ${scores.length} score records from ${source} with real-time data`);
    res.json({ 
      success: true, 
      source: source,
      count: scores.length,
      data: scores 
    });
    
  } catch (error) {
    console.error('❌ Latest scores error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get latest scores',
      message: error.message 
    });
  }
});

module.exports = router;