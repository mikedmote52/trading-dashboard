const { runScreener } = require('../../lib/runScreener');
const { getScreenerConfig } = require('../../lib/config');
const { saveScoresAtomically } = require('../services/sqliteScores');
const { getConfig } = require('../services/config');

let failCount = 0;
let lastSuccessTs = 0;
let lastErrorTs = 0;
let refresherRunning = false;

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
      const { engine, universeTarget } = getConfig();
      const { extraArgs, timeoutMs } = getScreenerConfig();
      const raw = await runScreener(['--limit', String(universeTarget), ...extraArgs], timeoutMs);
      const items = normalize(raw);
      
      if (items.length > 0) {
        const wrote = await saveScoresAtomically(items, {
          run_id: runId,
          engine,
          universe: universeTarget,
          snapshot_ts: new Date().toISOString(),
        });
        
        failCount = 0;
        lastSuccessTs = Date.now();
        const dur = Date.now() - t0;
        console.info(`[worker] run_id=${runId} engine=${engine} universe=${universeTarget} status=success duration_ms=${dur} wrote=${wrote}`);
      } else {
        throw new Error('No items normalized from screener output');
      }
      
      await sleep(refreshMs);
      
    } catch (e) {
      failCount++;
      lastErrorTs = Date.now();
      const dur = Date.now() - t0;
      console.warn(`[worker] run_id=${runId} status=fail duration_ms=${dur} err="${(e && e.message) || e}" fails=${failCount}`);
      
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

function getRefresherState() {
  return { failCount, lastSuccessTs, lastErrorTs, running: refresherRunning };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  startDiscoveryRefresher,
  stopDiscoveryRefresher,
  getRefresherState
};