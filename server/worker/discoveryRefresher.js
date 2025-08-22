const { runScreener } = require('../../lib/runScreener');
const { getProfile } = require('../../lib/screenerProfile');
const { saveScoresAtomically } = require('../services/sqliteScores');
const { getConfig } = require('../services/config');
const fs = require('fs');
const path = require('path');

let failCount = 0;
let lastSuccessTs = 0;
let lastErrorTs = 0;
let lastRunDuration = 0;
let refresherRunning = false;

// Auto-tuning state
let universeTarget = Number(process.env.UNIVERSE_TARGET || 1000);
const TUNE_PATH = path.join('/tmp', 'screener_autotune.json');

try {
  const tuneData = JSON.parse(fs.readFileSync(TUNE_PATH, 'utf8'));
  if (tuneData.universeTarget) universeTarget = tuneData.universeTarget;
} catch {
  // File doesn't exist or invalid JSON, use default
}

function normalize(raw) {
  const results = [];
  
  // Handle direct array of items from screener
  if (Array.isArray(raw)) {
    return raw.filter(item => item && item.ticker).map(mapItem);
  }
  
  // Handle object with items property (AlphaStack format)
  if (raw && raw.items && Array.isArray(raw.items)) {
    return raw.items.filter(item => item && (item.ticker || item.symbol)).map(mapItem);
  }
  
  // Handle single item
  if (raw && (raw.ticker || raw.symbol)) {
    return [mapItem(raw)];
  }
  
  // Handle case where raw is an object but items might be nested
  if (raw && typeof raw === 'object') {
    // Look for any array property that contains ticker/symbol objects
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value) && value.length > 0 && value[0] && (value[0].ticker || value[0].symbol)) {
        return value.filter(item => item && (item.ticker || item.symbol)).map(mapItem);
      }
    }
  }
  
  return results;
}

function mapItem(item) {
  return {
    ticker: item.ticker || item.symbol,
    price: item.price || item.current_price || 0,
    score: item.score || item.vigl_score || 70,
    action: item.action || ((item.score || 70) >= 75 ? 'BUY' : (item.score || 70) >= 65 ? 'EARLY_READY' : 'PRE_BREAKOUT'),
    confidence: Math.min(95, Math.max(60, item.score || 70)),
    thesis: item.thesis || item.thesis_tldr || `Discovery score: ${item.score || 70}`,
    engine: item.engine || 'screener_live',
    run_id: item.run_id || `run_${Date.now()}`,
    snapshot_ts: item.snapshot_ts || new Date().toISOString()
  };
}

async function startDiscoveryRefresher() {
  if (refresherRunning) {
    console.warn('[worker] Discovery refresher already running');
    return;
  }
  
  refresherRunning = true;
  console.info('[worker] Starting discovery refresher background worker');
  
  const { refreshMs } = getConfig();

  while (refresherRunning) {
    const t0 = Date.now();
    const runId = `run_${Date.now()}`;
    
    try {
      const { engine } = getConfig();
      const { args, session } = getProfile();
      const timeoutMs = Number(process.env.SCREENER_TIMEOUT_MS || 180000);
      
      const raw = await runScreener(['--limit', String(Math.min(120, universeTarget)), ...args], timeoutMs);
      const items = normalize(raw);
      
      if (items.length > 0) {
        const wrote = await saveScoresAtomically(items, {
          run_id: runId,
          engine,
          universe: universeTarget,
          snapshot_ts: new Date().toISOString(),
          session
        });
        
        failCount = 0;
        lastSuccessTs = Date.now();
        lastRunDuration = Date.now() - t0;
        
        // Auto-tune universe target based on duration
        autotune(lastRunDuration);
        
        console.info(`[worker] run_id=${runId} engine=${engine} universe=${universeTarget} session=${session} status=success duration_ms=${lastRunDuration} wrote=${wrote}`);
      } else {
        throw new Error('No items normalized from screener output');
      }
      
      await sleep(refreshMs);
      
    } catch (e) {
      failCount++;
      lastErrorTs = Date.now();
      lastRunDuration = Date.now() - t0;
      console.warn(`[worker] run_id=${runId} status=fail duration_ms=${lastRunDuration} err="${(e && e.message) || e}" fails=${failCount}`);
      
      // Exponential backoff: 5s -> 15s -> 45s -> 60s (cap)
      const backoffMs = Math.min(5000 * Math.pow(3, Math.max(0, failCount - 1)), 60000);
      await sleep(backoffMs);
    }
  }
}

function stopDiscoveryRefresher() {
  refresherRunning = false;
  console.info('[worker] Stopping discovery refresher');
}

function autotune(durationMs) {
  const oldTarget = universeTarget;
  
  if (durationMs > 110000) {
    // Too slow, reduce universe size
    universeTarget = Math.max(300, Math.floor(universeTarget * 0.9));
  } else if (durationMs < 60000) {
    // Fast enough, can increase universe size
    universeTarget = Math.min(1500, Math.floor(universeTarget * 1.1));
  }
  
  if (universeTarget !== oldTarget) {
    console.log(`[autotune] ${durationMs}ms → universe ${oldTarget} → ${universeTarget}`);
    try {
      fs.writeFileSync(TUNE_PATH, JSON.stringify({ universeTarget, lastTune: Date.now() }), 'utf8');
    } catch (e) {
      console.warn('[autotune] failed to save state:', e.message);
    }
  }
}

function getRefresherState() {
  return { 
    failCount, 
    lastSuccessTs, 
    lastErrorTs, 
    lastRunDuration,
    universeTarget,
    running: refresherRunning 
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  startDiscoveryRefresher,
  stopDiscoveryRefresher,
  getRefresherState
};