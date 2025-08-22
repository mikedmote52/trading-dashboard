const { runScreener } = require("../../lib/runScreener");
const { getScreenerConfig } = require("../../lib/config");

const cache = { 
  items: [], 
  updatedAt: 0, 
  running: false, 
  error: null 
};

const INTERVAL_MS = Number(process.env.V2_REFRESH_MS || 120000);
const TTL_MS = Number(process.env.DISCOVERY_TTL_MS || 180000);

async function runOnce() {
  if (cache.running) {
    console.log('⏭️  AlphaStack scan already running, skipping...');
    return;
  }
  
  cache.running = true;
  cache.error = null;
  
  console.log('🚀 Starting AlphaStack VIGL universe scan...');
  
  try {
    const { extraArgs, timeoutMs } = getScreenerConfig();
    const raw = await runScreener(['--limit', '60', ...extraArgs], timeoutMs);
    
    // Normalize the output
    const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
    
    cache.items = items.map(item => ({
      ticker: item.ticker || item.symbol,
      symbol: item.ticker || item.symbol,
      score: item.score || item.vigl_score || 70,
      price: item.price || 0,
      thesis: item.thesis || item.thesis_tldr || `Score: ${item.score || 70}`,
      run_id: item.run_id,
      snapshot_ts: item.snapshot_ts
    }));
    
    cache.updatedAt = Date.now();
    cache.error = null;
    cache.running = false;
    
    console.log(`✅ AlphaStack scan complete: ${cache.items.length} real opportunities found`);
    
    // Log sample results for verification
    if (cache.items.length > 0) {
      const sample = cache.items.slice(0, 3);
      console.log('📊 Sample discoveries:', sample.map(d => `${d.symbol || d.ticker}:${d.score}`).join(', '));
    }
    
  } catch (error) {
    cache.running = false;
    cache.error = error.message;
    console.error('❌ AlphaStack screener failed:', error.message);
  }
}

function startLoop() {
  console.log('🔄 Starting AlphaStack background screener loop...');
  runOnce(); // warm immediately
  const intervalId = setInterval(runOnce, INTERVAL_MS);
  
  // Cleanup on process exit
  process.on('SIGTERM', () => {
    console.log('🛑 Stopping AlphaStack screener loop...');
    clearInterval(intervalId);
  });
  
  return intervalId;
}

function getCache() {
  // Never serve stale as "fresh": caller can see 'running' status
  const fresh = (Date.now() - cache.updatedAt) < TTL_MS;
  return { ...cache, fresh };
}

function forceRefresh() {
  if (!cache.running) {
    console.log('🔄 Force refreshing AlphaStack cache...');
    runOnce();
    return true;
  }
  return false;
}

module.exports = {
  startLoop,
  getCache,
  forceRefresh
};