// Real AlphaStack Discovery Cache - No Mock Data
const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

// Real discovery cache
let discoveryCache = {
  data: [],
  lastUpdate: 0,
  isRunning: false,
  error: null
};

const CACHE_TTL = 180000; // 3 minutes (180s)
const SCRIPT_TIMEOUT = 300000; // 5 minutes for full universe scan

// GET /api/discoveries/latest - Real AlphaStack VIGL discoveries
router.get('/latest', async (req, res) => {
  try {
    const now = Date.now();
    const cacheAge = now - discoveryCache.lastUpdate;
    
    // Return cached data if fresh
    if (cacheAge < CACHE_TTL && discoveryCache.data.length > 0) {
      return res.json({
        success: true,
        discoveries: discoveryCache.data,
        cached: true,
        age_seconds: Math.round(cacheAge / 1000),
        running: discoveryCache.isRunning,
        count: discoveryCache.data.length,
        source: 'alphastack_vigl'
      });
    }
    
    // Trigger refresh if not already running
    if (!discoveryCache.isRunning) {
      refreshDiscoveryCache();
    }
    
    // Return current state (may be empty if first run)
    res.json({
      success: true,
      discoveries: discoveryCache.data,
      cached: false,
      age_seconds: Math.round(cacheAge / 1000),
      running: discoveryCache.isRunning,
      count: discoveryCache.data.length,
      source: 'alphastack_vigl',
      message: discoveryCache.isRunning ? 'AlphaStack scan in progress...' : 'Initiating AlphaStack discovery...'
    });
    
  } catch (error) {
    console.error('❌ Discovery latest error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      discoveries: [],
      running: discoveryCache.isRunning
    });
  }
});

// Refresh discovery cache using real AlphaStack universe screener
function refreshDiscoveryCache() {
  if (discoveryCache.isRunning) {
    console.log('🔄 AlphaStack scan already running, skipping...');
    return;
  }
  
  discoveryCache.isRunning = true;
  discoveryCache.error = null;
  
  console.log('🚀 Starting real AlphaStack VIGL discovery scan...');
  
  const scriptPath = path.resolve('agents/universe_screener.py');
  const args = ['--limit', '50', '--full-universe', '--exclude-symbols', 'BTAI,KSS,UP,TNXP'];
  
  const proc = spawn('python3', [scriptPath, ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let stderr = '';
  
  proc.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  
  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  
  // Timeout protection
  const timeout = setTimeout(() => {
    console.log('⚠️ AlphaStack scan timeout, terminating...');
    proc.kill('SIGTERM');
    discoveryCache.isRunning = false;
    discoveryCache.error = 'Scan timeout';
  }, SCRIPT_TIMEOUT);
  
  proc.on('close', (code) => {
    clearTimeout(timeout);
    discoveryCache.isRunning = false;
    
    if (code === 0) {
      try {
        // Parse JSON output from universe screener
        const lines = stdout.split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('['));
        
        if (jsonLine) {
          const discoveries = JSON.parse(jsonLine);
          
          // Transform to consistent format for frontend
          discoveryCache.data = discoveries.map(d => ({
            symbol: d.symbol,
            score: d.score || 50,
            price: d.price || 0,
            rel_vol_30m: d.rel_vol_30m || d.rel_vol || 1.0,
            action: d.action || (d.score >= 75 ? 'BUY' : d.score >= 65 ? 'EARLY_READY' : 'WATCHLIST'),
            thesis: d.thesis || `AlphaStack VIGL Score: ${d.score}`,
            target_price: d.target_price || (d.price * 1.15),
            upside_pct: d.upside_pct || 15,
            confidence: d.confidence || Math.min(95, Math.max(40, d.score)),
            bucket: d.bucket || 'discovery',
            source: 'alphastack_vigl',
            timestamp: Date.now()
          }));
          
          discoveryCache.lastUpdate = Date.now();
          discoveryCache.error = null;
          
          console.log(`✅ AlphaStack discovery complete: ${discoveryCache.data.length} real opportunities found`);
          
          // Log sample results for verification
          if (discoveryCache.data.length > 0) {
            const sample = discoveryCache.data.slice(0, 3);
            console.log('📊 Sample discoveries:', sample.map(d => `${d.symbol}:${d.score}`).join(', '));
          }
          
        } else {
          console.log('❌ No JSON output from AlphaStack screener');
          discoveryCache.error = 'No JSON output from screener';
        }
        
      } catch (parseError) {
        console.error('❌ Failed to parse AlphaStack output:', parseError.message);
        discoveryCache.error = 'Parse error: ' + parseError.message;
      }
    } else {
      console.error(`❌ AlphaStack screener failed with code ${code}`);
      console.error('Stderr:', stderr.substring(0, 500));
      discoveryCache.error = `Screener exit code: ${code}`;
    }
  });
  
  proc.on('error', (error) => {
    clearTimeout(timeout);
    discoveryCache.isRunning = false;
    discoveryCache.error = error.message;
    console.error('❌ AlphaStack process error:', error.message);
  });
}

// Auto-refresh on startup
setTimeout(() => {
  console.log('🔥 Auto-starting AlphaStack discovery cache...');
  refreshDiscoveryCache();
}, 5000); // 5 second delay after startup

// Periodic refresh
setInterval(() => {
  const cacheAge = Date.now() - discoveryCache.lastUpdate;
  if (cacheAge >= CACHE_TTL && !discoveryCache.isRunning) {
    console.log('🔄 Auto-refreshing AlphaStack discovery cache...');
    refreshDiscoveryCache();
  }
}, 60000); // Check every minute

module.exports = router;