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

module.exports = router;