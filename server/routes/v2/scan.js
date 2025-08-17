const express = require('express');
const cache = require('../../../src/screener/v2/cache');
const runDirectOnce = require('../../../src/screener/v2/run-direct');
const { scheduleLoop } = require('../../../src/screener/v2/worker');
const router = express.Router();

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
    try {
        const debug = "debug" in req.query;
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
                const results = snap.tickers.map(candidate => ({
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
                    score: candidate.score || 50,
                    plan: { 
                        entry: candidate.thesis || "Cache hit", 
                        stopPct: 10, 
                        tp1Pct: candidate.upside_pct || 20, 
                        tp2Pct: (candidate.upside_pct || 20) * 2 
                    }
                }));
                
                return res.json({ 
                    asof: new Date(snap.updatedAt).toISOString(), 
                    results,
                    source: "cache"
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
        
        const results = candidates.map(candidate => ({
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
            score: candidate.score || 50,
            plan: { 
                entry: candidate.thesis || "Fallback run", 
                stopPct: 10, 
                tp1Pct: candidate.upside_pct || 20, 
                tp2Pct: (candidate.upside_pct || 20) * 2 
            }
        }));
        
        return res.json({ 
            asof: new Date().toISOString(), 
            results, 
            source: "fallback", 
            debug: !!debug 
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