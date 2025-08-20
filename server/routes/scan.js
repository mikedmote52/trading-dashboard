const express = require('express');
const router = express.Router();
const { scanUniverse, CONFIG } = require('../../src/screener/alphastack-scanner');

// Cache scan results for 5 minutes to avoid hammering APIs
let scanCache = {
    data: null,
    timestamp: 0,
    inProgress: false,
    params: null,
    gateCounts: null
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/scan/today
 * Returns today's AlphaStack scan results
 */
router.get('/today', async (req, res) => {
    try {
        // Extract scan parameters from query
        const toBool = v => !(v === undefined || v === null || `${v}`.toLowerCase() === 'false' || `${v}` === '0');
        const scanParams = {
            relvolmin: parseFloat(req.query.relvolmin) || 3.0,
            rsimin: parseFloat(req.query.rsimin) || 60,
            rsimax: parseFloat(req.query.rsimax) || 75,
            atrpctmin: parseFloat(req.query.atrpctmin) || 4.0,
            requireemacross: toBool(req.query.requireemacross),
            autoTune: req.query.autoTune === '1'
        };
        
        // Check if scan is already in progress
        if (scanCache.inProgress) {
            return res.json({
                status: 'scanning',
                message: 'Scan in progress, please wait...',
                cached: scanCache.data || [],
                cacheAge: scanCache.timestamp ? Math.floor((Date.now() - scanCache.timestamp) / 1000) : null
            });
        }
        
        // Return cached data if fresh
        if (scanCache.data && (Date.now() - scanCache.timestamp) < CACHE_TTL) {
            const ageSeconds = Math.floor((Date.now() - scanCache.timestamp) / 1000);
            
            return res.json({
                status: 'success',
                source: 'cache',
                ageSeconds,
                tradeReady: scanCache.data.filter(t => t.action === 'TRADE_READY'),
                watchlist: scanCache.data.filter(t => t.action === 'WATCHLIST'),
                all: scanCache.data,
                config: {
                    maxPrice: CONFIG.MAX_PRICE,
                    budgetPerStock: CONFIG.BUDGET_PER_STOCK,
                    scoreThresholds: {
                        watchlist: CONFIG.SCORE_THRESHOLD_WATCHLIST,
                        tradeReady: CONFIG.SCORE_THRESHOLD_TRADE
                    }
                }
            });
        }
        
        // Force refresh if requested
        const forceRefresh = req.query.refresh === '1';
        
        if (!forceRefresh && scanCache.data) {
            // Return stale cache with warning
            return res.json({
                status: 'stale',
                source: 'cache',
                ageSeconds: Math.floor((Date.now() - scanCache.timestamp) / 1000),
                message: 'Data is stale, add ?refresh=1 to force refresh',
                tradeReady: scanCache.data.filter(t => t.readiness_tier === 'TRADE_READY'),
                earlyReady: scanCache.data.filter(t => t.readiness_tier === 'EARLY_READY'),
                watchlist: scanCache.data.filter(t => t.readiness_tier === 'WATCH' || t.action === 'WATCHLIST'),
                all: scanCache.data
            });
        }
        
        // Check if scan is already in progress (debouncing)
        if (scanCache.inProgress) {
            return res.json({
                status: 'debounced',
                message: 'Scan already in progress, please wait...',
                cached: scanCache.data || [],
                cacheAge: scanCache.timestamp ? Math.floor((Date.now() - scanCache.timestamp) / 1000) : null
            });
        }
        
        // Start new scan
        scanCache.inProgress = true;
        console.log('🔍 Starting AlphaStack universe scan...');
        
        // Run discovery scan with enhanced parameters
        const discoveryService = require('../services/discovery_service');
        discoveryService.scanOnce(forceRefresh)
            .then(result => {
                scanCache.data = result.results || result.candidates || result;
                scanCache.params = scanParams;
                scanCache.gateCounts = result.gateCounts || {};
                scanCache.relaxationActive = result.relaxation_active || false;
                scanCache.relaxationSince = result.relaxation_since || null;
                scanCache.discoveryMetrics = result.discovery_metrics || {};
                scanCache.timestamp = Date.now();
                scanCache.inProgress = false;
                
                const tradeReady = scanCache.data.filter(c => c.readiness_tier === 'TRADE_READY').length;
                const earlyReady = scanCache.data.filter(c => c.readiness_tier === 'EARLY_READY').length;
                const watch = scanCache.data.filter(c => c.readiness_tier === 'WATCH').length;
                
                console.log(`✅ Scan completed: ${scanCache.data.length} candidates found`);
                console.log(`   📊 Trade-Ready: ${tradeReady}, Early-Ready: ${earlyReady}, Watch: ${watch}`);
                if (scanCache.relaxationActive) {
                    console.log(`   ❄️ Cold tape relaxation active`);
                }
            })
            .catch(error => {
                console.error('❌ Scan failed:', error);
                scanCache.inProgress = false;
            });
        
        // Return immediate response
        res.json({
            status: 'started',
            message: 'Scan started, check back in 30-60 seconds',
            cached: scanCache.data || [],
            cacheAge: scanCache.timestamp ? Math.floor((Date.now() - scanCache.timestamp) / 1000) : null
        });
        
    } catch (error) {
        console.error('❌ Scan endpoint error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

/**
 * GET /api/scan/results
 * Returns just the scan results array
 */
router.get('/results', (req, res) => {
    if (!scanCache.data) {
        return res.json([]);
    }
    
    res.json(scanCache.data);
});

/**
 * GET /api/scan/status
 * Returns current scan status
 */
router.get('/status', async (req, res) => {
    const { DISCOVERY, getCurrentThresholds } = require('../../config/discovery');
    const { getPolygonStatus, checkPolygonHealth } = require('../utils/polygon_monitor');
    const currentThresholds = getCurrentThresholds();
    
    // Check Polygon health if requested
    let polygonStatus = getPolygonStatus();
    if (req.query.check_polygon === '1') {
        polygonStatus = await checkPolygonHealth();
    }
    
    res.json({
        inProgress: scanCache.inProgress,
        hasData: !!scanCache.data,
        dataAge: scanCache.timestamp ? Math.floor((Date.now() - scanCache.timestamp) / 1000) : null,
        dataCount: scanCache.data ? scanCache.data.length : 0,
        tradeReadyCount: scanCache.data ? scanCache.data.filter(t => t.readiness_tier === 'TRADE_READY').length : 0,
        earlyReadyCount: scanCache.data ? scanCache.data.filter(t => t.readiness_tier === 'EARLY_READY').length : 0,
        watchlistCount: scanCache.data ? scanCache.data.filter(t => t.readiness_tier === 'WATCH' || t.action === 'WATCHLIST').length : 0,
        params: scanCache.params,
        gateCounts: scanCache.gateCounts,
        relaxation_active: scanCache.relaxationActive || false,
        relaxation_since: scanCache.relaxationSince,
        thresholds: currentThresholds,
        discoveryMetrics: scanCache.discoveryMetrics,
        config: CONFIG,
        polygonStatus: polygonStatus.status,
        polygonDetails: {
            hasKey: polygonStatus.hasKey,
            lastCheckAge: polygonStatus.lastCheckAge,
            errorCount: polygonStatus.errorCount,
            rateLimited: polygonStatus.rateLimited
        }
    });
});

/**
 * GET /api/scan/ticker/:symbol
 * Get specific ticker from scan results
 */
router.get('/ticker/:symbol', (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    
    if (!scanCache.data) {
        return res.status(404).json({
            error: 'No scan data available'
        });
    }
    
    const ticker = scanCache.data.find(t => t.ticker === symbol);
    
    if (!ticker) {
        return res.status(404).json({
            error: `${symbol} not found in scan results`
        });
    }
    
    res.json({
        status: 'success',
        data: ticker,
        dataAge: Math.floor((Date.now() - scanCache.timestamp) / 1000)
    });
});

/**
 * POST /api/scan/filter
 * Apply custom filters to scan results
 */
router.post('/filter', (req, res) => {
    if (!scanCache.data) {
        return res.status(404).json({
            error: 'No scan data available'
        });
    }
    
    const {
        minScore = 0,
        maxPrice = 1000,
        minRelVol = 0,
        action = null
    } = req.body;
    
    let filtered = scanCache.data.filter(t => {
        if (t.alphaScore < minScore) return false;
        if (t.price > maxPrice) return false;
        if (parseFloat(t.relVolume) < minRelVol) return false;
        if (action && t.action !== action) return false;
        return true;
    });
    
    res.json({
        status: 'success',
        count: filtered.length,
        results: filtered,
        filters: { minScore, maxPrice, minRelVol, action }
    });
});

module.exports = router;