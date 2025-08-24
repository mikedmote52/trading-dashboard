const { DISABLE_V2 } = require('../../../src/config/flags');
const express = require('express');
const cache = require('../../../src/screener/v2/cache');
const runDirectOnce = require('../../../src/screener/v2/run-direct');
const { scheduleLoop } = require('../../../src/screener/v2/worker');
const { deriveAlphaThesis } = require('../../lib/thesis');
const router = express.Router();

// --- AlphaStack rubric scorer (v1) ---
function scoreAlpha(c) {
  const rvol = Number(c.rvol ?? c.rel_vol_30m ?? c.rel_vol ?? 1);
  const rsi  = Number(c.rsi ?? 50);
  const vwapRel = Number(c.vwapRel ?? (c.vwapDelta != null ? 1 + (c.vwapDelta/100) : 1));
  const vwapDelta = (vwapRel - 1) * 100;
  const atrPct = Number(c.atrPct ?? c.technicals?.atrPct ?? 0);
  const floatM = Number(c.float ?? 0);
  const si  = Number(c.shortInterestPct ?? c.short_interest ?? 0);
  const fee = Number(c.borrowFee ?? c.borrow_fee ?? 0);
  const util = Number(c.utilization ?? 0);
  const callPut = Number(c.callPutRatio ?? 1);
  const ivp = Number(c.ivPercentile ?? 50);
  const emaBull = Boolean(c.ema9_gt_ema20 ?? c.technicals?.emaCross);

  let s = 0;
  // 25% Volume & Momentum
  s += rvol >= 3 ? 25 : rvol >= 2 ? 18 : rvol >= 1.5 ? 12 : rvol > 1 ? 8 : 0;
  // 20% Float & Short
  const utilPct = util > 1 ? util : util * 100;
  let sq = 0;
  if (floatM > 0 && floatM <= 50) sq += 10;
  if (si >= 20) sq += 6; else if (si >= 10) sq += 3;
  if (fee >= 20) sq += 3;
  if (utilPct >= 85) sq += 1;
  s += Math.min(20, sq);
  // 20% Catalyst
  const cat = c.catalyst?.type?.toLowerCase?.();
  s += (cat && (cat.includes('earnings') || cat.includes('fda') || cat.includes('m&a') || cat.includes('insider'))) ? 20 : (cat ? 12 : 0);
  // 15% Sentiment
  let sent = 0;
  if ((c.sentiment?.redditRank ?? 99) <= 10) sent += 7;
  if ((c.sentiment?.stocktwitsRank ?? 99) <= 10) sent += 5;
  if ((c.sentiment?.youtubeTrend ?? '').toLowerCase() === 'surging') sent += 3;
  s += Math.min(15, sent);
  // 10% Options
  let opt = 0;
  if (callPut >= 2) opt += 6;
  if (ivp >= 80) opt += 4;
  s += Math.min(10, opt);
  // 10% Technicals
  let tech = 0;
  if (emaBull) tech += 4;
  if (vwapDelta >= 0) tech += 3;
  if (atrPct >= 4) tech += 3;
  if (rsi >= 60 && rsi <= 70) tech += 2;
  s += Math.min(10, tech);

  return Math.max(0, Math.min(100, Math.round(s)));
}

// --- Entry filters ---
// Apply gates only when the metric exists; always enforce score gate.
function passesAlphaFilters(c) {
  if (c.score < 30) return false; // Temporarily lowered to see what data we have

  const rvol = num(c.rvol ?? c.rel_vol_30m ?? c.rel_vol);
  const atr  = num(c.atrPct ?? c.technicals?.atrPct);
  const vwapRel = num(c.vwapRel);
  const emaBull = bool(c.ema9_gt_ema20 ?? c.technicals?.emaCross);
  const floatM = num(c.float);
  const si  = num(c.shortInterestPct ?? c.short_interest);
  const fee = num(c.borrowFee ?? c.borrow_fee);
  const util = num(c.utilization);

  // Gates only if data present - RELAXED for debugging
  if (rvol != null && rvol < 0.5) return false;  // Was 1.5
  if (atr  != null && atr  < 1)   return false;  // Was 4
  if ((vwapRel != null || emaBull != null) && !(emaBull || (vwapRel != null && vwapRel >= 1))) return false;

  if (floatM != null && floatM > 150) {
    const hasShortData = si != null || fee != null || util != null;
    if (hasShortData) {
      const utilPct = util != null ? (util > 1 ? util : util * 100) : null;
      if (!(si >= 20 && fee >= 20 && (utilPct == null || utilPct >= 85))) return false;
    }
  }
  return true;

  function num(x){ return (x === undefined || x === null || Number.isNaN(Number(x))) ? null : Number(x); }
  function bool(x){ return x === true; }
}

// One-time boot (idempotent)
let booted = false;
router.use((req, _res, next) => {
  if (!booted) {
    booted = true;
    if (process.env.ALPHASTACK_DEBUG === "1" || process.env.ENABLE_V2_WORKER !== "0") {
      console.log('🚀 V2: Starting background worker');
      scheduleLoop();
    } else {
      console.log('ℹ️ V2: Background worker disabled (ENABLE_V2_WORKER=0)');
    }
  }
  next();
});


/**
 * GET /api/v2/scan/squeeze
 * Returns squeeze candidates with fallback when cache is empty/stale
 */
router.get('/squeeze', async (req, res) => {
    if (DISABLE_V2) return res.status(503).json({ skipped:true, reason:'V2 disabled on this service' });
    try {
        const debug = "debug" in req.query;
        const bypass = req.query.nocache === '1';
        const nofallback = req.query.nofallback === '1';
        const snap = cache.getSnapshot();
        console.log(`🔍 V2 Debug: Cache fresh=${snap.fresh}, count=${snap.tickers?.length || 0}, first=${typeof snap.tickers?.[0]}`);

        // Fresh cache → return immediately
        if (snap.fresh && Array.isArray(snap.tickers) && snap.tickers.length > 0) {
            // Check if cache contains full objects or just strings
            const firstItem = snap.tickers[0];
            const hasFullData = typeof firstItem === 'object' && firstItem.symbol;
            
            if (!hasFullData) {
                // Cache contains old string-only data, force fallback
                console.log('🔄 V2 Scan: Cache contains string tickers, forcing fallback for real data');
            } else {
                res.set("x-cache", "fresh");
                let results = snap.tickers.map(candidate => {
                    // Derive thesis if not present
                    const thesisData = (!candidate.thesis || !candidate.reasons) 
                        ? deriveAlphaThesis(candidate) 
                        : { thesis: candidate.thesis, reasons: candidate.reasons };
                    
                    return {
                        ticker: candidate.symbol || candidate,
                        price: candidate.price || 0,
                        changePct: candidate.upside_pct || 0,
                        rvol: candidate.rel_vol_30m || 1.0,
                        vwapRel: 1.0,
                        floatM: candidate.float_shares ? (candidate.float_shares / 1000000) : 0,
                        shortPct: candidate.short_interest || 0,
                        borrowFeePct: candidate.borrow_fee || 0,
                        utilizationPct: candidate.utilization || 0,
                        options: { cpr: 0, ivPctile: 0, atmOiTrend: "neutral" },
                        technicals: { emaCross: false, atrPct: 0, rsi: 50 },
                        catalyst: { type: "Momentum", when: new Date().toISOString().split('T')[0] },
                        sentiment: { redditRank: 5, stocktwitsRank: 5, youtubeTrend: "neutral" },
                        score: scoreAlpha(candidate),
                        score_version: "alphastack_v1",
                        thesis: thesisData.thesis,
                        reasons: thesisData.reasons,
                        plan: { 
                            entry: candidate.thesis || "Cache hit", 
                            stopPct: 10, 
                            tp1Pct: candidate.upside_pct || 20, 
                            tp2Pct: (candidate.upside_pct || 20) * 2 
                        }
                    };
                });
                
                // map → score → filter → dedupe → sort → slice
                const seen = new Set();
                let enriched = results.map(c => {
                  const s = scoreAlpha(c);
                  return { ...c, score: s, score_version: "alphastack_v1" };
                });
                
                // Debug logging
                console.log('🔍 Pre-filter candidates:', enriched.map(c => ({
                    ticker: c.ticker,
                    score: c.score,
                    rvol: c.rvol,
                    atrPct: c.technicals?.atrPct
                })));
                const filtered = enriched.filter(passesAlphaFilters);
                const deduped  = filtered.filter(x => !seen.has(x.ticker) && seen.add(x.ticker));
                const ranked   = deduped.sort((a,b) => b.score - a.score || (Number(b.rvol ?? 0) - Number(a.rvol ?? 0)) || (Number(b.changePct ?? 0) - Number(a.changePct ?? 0)))
                                       .slice(0, 10);
                
                const preFilterCount = enriched.length;
                const postFilterCount = ranked.length;
                results = ranked;
                
                // Set cache metadata for debug status
                req.app.locals.v2Cache = { 
                    updatedAt: Date.now(), 
                    lastSource: 'cache',
                    preFilterCount,
                    postFilterCount: results.length
                };
                
                // If nothing passes, return empty live response (NO fallback here)
                if (ranked.length === 0) {
                  return res.json({ source: "live", results: [], meta: { filtered: true, reason: "no_candidates_after_filters" }});
                }
                
                return res.json({ 
                    asof: new Date(snap.updatedAt).toISOString(), 
                    results,
                    source: "live",
                    meta: {
                        filtered: true,
                        preFilterCount,
                        postFilterCount
                    }
                });
            }
        }

        // Fallback path: run direct once so UI isn't empty
        console.log('🔄 V2 Scan: Cache miss/stale, running direct fallback');
        const candidates = await runDirectOnce();
        res.set("x-cache", "miss-fallback");
        
        if (!snap.tickers || !snap.tickers.length) {
            // populate cache opportunistically
            cache.setSnapshot(candidates);
        }
        
        let results = candidates.map(candidate => {
            // Derive thesis if not present
            const thesisData = (!candidate.thesis || !candidate.reasons) 
                ? deriveAlphaThesis(candidate) 
                : { thesis: candidate.thesis, reasons: candidate.reasons };
            
            return {
                ticker: candidate.symbol || candidate,
                price: candidate.price || 0,
                changePct: candidate.upside_pct || 0,
                rvol: candidate.rel_vol_30m || 1.0,
                vwapRel: 1.0,
                floatM: candidate.float_shares ? (candidate.float_shares / 1000000) : 0,
                shortPct: candidate.short_interest || 0,
                borrowFeePct: candidate.borrow_fee || 0,
                utilizationPct: candidate.utilization || 0,
                options: { cpr: 0, ivPctile: 0, atmOiTrend: "neutral" },
                technicals: { emaCross: false, atrPct: 0, rsi: 50 },
                catalyst: { type: "Momentum", when: new Date().toISOString().split('T')[0] },
                sentiment: { redditRank: 5, stocktwitsRank: 5, youtubeTrend: "neutral" },
                score: scoreAlpha(candidate),
                        score_version: "alphastack_v1",
                thesis: thesisData.thesis,
                reasons: thesisData.reasons,
                plan: { 
                    entry: candidate.thesis || "Fallback run", 
                    stopPct: 10, 
                    tp1Pct: candidate.upside_pct || 20, 
                    tp2Pct: (candidate.upside_pct || 20) * 2 
                }
            };
        });
        
        // map → score → filter → dedupe → sort → slice
        const seen = new Set();
        let enriched = results.map(c => {
          const s = scoreAlpha(c);
          return { ...c, score: s, score_version: "alphastack_v1" };
        });
        
        const filtered = enriched.filter(passesAlphaFilters);
        const deduped  = filtered.filter(x => !seen.has(x.ticker) && seen.add(x.ticker));
        const ranked   = deduped.sort((a,b) => b.score - a.score || (Number(b.rvol ?? 0) - Number(a.rvol ?? 0)) || (Number(b.changePct ?? 0) - Number(a.changePct ?? 0)))
                               .slice(0, 10);
        
        const preFilterCount = enriched.length;
        const postFilterCount = ranked.length;
        results = ranked;
        
        // Set cache metadata for debug status
        req.app.locals.v2Cache = { 
            updatedAt: Date.now(), 
            lastSource: 'fallback',
            preFilterCount,
            postFilterCount: results.length
        };
        
        // If nothing passes, return empty live response (NO fallback here)
        if (ranked.length === 0) {
          return res.json({ source: "live", results: [], meta: { filtered: true, reason: "no_candidates_after_filters" }});
        }
        
        return res.json({ 
            asof: new Date().toISOString(), 
            results, 
            source: "live", 
            debug: !!debug,
            meta: {
                filtered: true,
                preFilterCount,
                postFilterCount
            }
        });
        
    } catch (error) {
        console.error('❌ V2 Scan: Both cache and fallback failed:', error);
        const snap = cache.getSnapshot();
        res.status(500).json({ 
            asof: new Date().toISOString(),
            results: [], 
            error: error.message, 
            cacheError: snap.error, 
            source: "error" 
        });
    }
});

// Debug endpoints for screener comparison
router.get('/criteria', (req, res) => {
    res.json({
        universe_limit: 10,
        exclude_symbols: "BTAI,KSS,UP,TNXP", 
        data_source: "universe_screener.py + v2_formatting",
        version: "v2",
        caching: "30s background refresh",
        timeout: "15000ms"
    });
});

router.get('/datasources', (req, res) => {
    res.json([
        { name: "Polygon", version: "REST API v2", lastSync: "real-time", notes: "Price and volume data" },
        { name: "Python Universe Screener", version: "1.0", lastSync: "cached-30s", notes: "Momentum and technical analysis via V2 formatting" },
        { name: "V2 Cache Layer", version: "1.0", lastSync: new Date().toISOString(), notes: "Background refresh with 30s intervals" }
    ]);
});

router.get('/filters', (req, res) => {
    res.json([
        "universe_generation",
        "momentum_filter",
        "volume_filter", 
        "technical_analysis",
        "exclusion_filter",
        "v2_formatting",
        "cache_layer"
    ]);
});

router.post('/stepwise', async (req, res) => {
    if (DISABLE_V2) return res.status(503).json({ skipped:true, reason:'V2 disabled on this service' });
    try {
        // Simulate stepwise filtering for V2 (with cache layer)
        const universe = req.body.universe || [];
        const reports = [
            {
                filterName: "universe_generation",
                beforeCount: 0,
                afterCount: 50,
                dropped: [],
                kept: Array.from({length: 50}, (_, i) => `STOCK${i+1}`)
            },
            {
                filterName: "momentum_filter",
                beforeCount: 50,
                afterCount: 25,
                dropped: Array.from({length: 25}, (_, i) => `STOCK${i+26}`),
                kept: Array.from({length: 25}, (_, i) => `STOCK${i+1}`)
            },
            {
                filterName: "volume_filter",
                beforeCount: 25,
                afterCount: 15,
                dropped: Array.from({length: 10}, (_, i) => `STOCK${i+16}`),
                kept: Array.from({length: 15}, (_, i) => `STOCK${i+1}`)
            },
            {
                filterName: "technical_analysis", 
                beforeCount: 15,
                afterCount: 12,
                dropped: Array.from({length: 3}, (_, i) => `STOCK${i+13}`),
                kept: Array.from({length: 12}, (_, i) => `STOCK${i+1}`)
            },
            {
                filterName: "exclusion_filter",
                beforeCount: 12,
                afterCount: 10,
                dropped: Array.from({length: 2}, (_, i) => `STOCK${i+11}`),
                kept: Array.from({length: 10}, (_, i) => `STOCK${i+1}`)
            },
            {
                filterName: "v2_formatting",
                beforeCount: 10,
                afterCount: 10,
                dropped: [],
                kept: Array.from({length: 10}, (_, i) => `STOCK${i+1}`)
            },
            {
                filterName: "cache_layer",
                beforeCount: 10,
                afterCount: 10,
                dropped: [],
                kept: Array.from({length: 10}, (_, i) => `STOCK${i+1}`)
            }
        ];
        
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Debug status endpoint
router.get('/debug/status', (req, res) => {
    const snap = cache.getSnapshot();
    res.json({
        fresh: snap.fresh,
        updatedAt: snap.updatedAt,
        error: snap.error,
        tickerCount: snap.tickers ? snap.tickers.length : 0,
        refreshMs: Number(process.env.V2_REFRESH_MS || 30000),
        cacheMs: Number(process.env.V2_CACHE_TTL_MS || 30000),
        workerEnabled: process.env.ENABLE_V2_WORKER !== "0",
        environment: {
            pythonBin: process.env.PYTHON_BIN || "python3",
            scriptPath: process.env.SCREENER_V2_SCRIPT || "agents/universe_screener.py",
            cwd: process.env.SCREENER_CWD || process.cwd()
        }
    });
});

module.exports = router;