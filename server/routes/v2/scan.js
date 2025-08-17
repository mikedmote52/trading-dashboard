const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

// Scan cache with background refresh
let scanCache = { 
    data: { asof: null, results: [] }, 
    ts: 0, 
    running: false 
};

function parseScreenerOutput(output) {
    try {
        const lines = output.split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('['));
        
        if (jsonLine) {
            const candidates = JSON.parse(jsonLine);
            return candidates.map(candidate => ({
                ticker: candidate.symbol,
                price: candidate.price,
                changePct: candidate.upside_pct || 0,
                rvol: candidate.rel_vol_30m || 1.0,
                vwapRel: 1.0, // placeholder
                floatM: 0, // placeholder
                shortPct: candidate.short_interest || 0,
                borrowFeePct: candidate.borrow_fee || 0,
                utilizationPct: candidate.utilization || 0,
                options: {
                    cpr: 0,
                    ivPctile: 0,
                    atmOiTrend: "neutral"
                },
                technicals: {
                    emaCross: false,
                    atrPct: 0,
                    rsi: 50
                },
                catalyst: {
                    type: "Momentum",
                    when: new Date().toISOString().split('T')[0]
                },
                sentiment: {
                    redditRank: 5,
                    stocktwitsRank: 5,
                    youtubeTrend: "neutral"
                },
                score: candidate.score,
                plan: {
                    entry: candidate.thesis || "Momentum play",
                    stopPct: 10,
                    tp1Pct: candidate.upside_pct || 20,
                    tp2Pct: (candidate.upside_pct || 20) * 2
                }
            }));
        }
        
        return [];
    } catch (error) {
        console.error('Error parsing screener output:', error);
        return [];
    }
}

async function computeScanSafe() {
    if (scanCache.running) return; // avoid stampede
    scanCache.running = true;
    
    try {
        console.log('🔄 V2 Scan: Background refresh starting...');
        
        const python = spawn('python3', [
            path.join(__dirname, '../../agents/universe_screener.py'),
            '--limit', '10',
            '--exclude-symbols', 'BTAI,KSS,UP,TNXP'
        ], {
            cwd: path.join(__dirname, '../..'),
            env: { ...process.env },
            timeout: 15000 // 15 second timeout
        });
        
        let output = '';
        let errorOutput = '';
        
        python.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        python.on('close', (code) => {
            if (code === 0) {
                const results = parseScreenerOutput(output);
                if (results.length > 0) {
                    scanCache.data = {
                        asof: new Date().toISOString(),
                        results: results
                    };
                    scanCache.ts = Date.now();
                    console.log(`✅ V2 Scan: Cache updated with ${results.length} candidates`);
                }
            } else {
                console.error('❌ V2 Scan: Background refresh failed with code', code);
            }
        });
        
        python.on('error', (error) => {
            console.error('❌ V2 Scan: Process error:', error.message);
        });
        
    } catch (error) {
        console.error('❌ V2 Scan: Compute failed:', error.message);
    } finally {
        scanCache.running = false;
    }
}

// Background refresh every 30 seconds during market hours
setInterval(computeScanSafe, 30000);

// Warm cache on startup
setTimeout(computeScanSafe, 2000);

/**
 * GET /api/v2/scan/squeeze
 * Returns cached squeeze candidates (fast response)
 */
router.get('/squeeze', async (req, res) => {
    try {
        // Return cached data immediately
        res.json(scanCache.data);
    } catch (error) {
        console.error('Error in /api/v2/scan/squeeze:', error);
        res.status(500).json({ 
            error: 'Failed to fetch squeeze scan results',
            message: error.message 
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

module.exports = router;