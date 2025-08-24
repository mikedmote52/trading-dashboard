const { WORKERS_ENABLED } = require('../../config/flags');
const path = require("path");
const cache = require("./cache");
const { runScreenerSingleton } = require("../../../server/lib/screenerSingleton");

const REFRESH_MS = Number(process.env.V2_REFRESH_MS || 120_000); // Increased to 2 minutes for full universe scans

let timer = null;

async function runOnce() {
  try {
    console.log(`🔄 V2 Worker: Starting background refresh...`);
    
    const result = await runScreenerSingleton({
      limit: 50,
      budgetMs: 120000,
      jsonOut: '/tmp/v2_worker_screener.json',
      caller: 'v2_worker'
    });

    const code = result.code;
    
    if (code === 0) {
      try {
        // Read JSON output file
        const fs = require('fs');
        if (fs.existsSync(result.jsonOut)) {
          const jsonContent = fs.readFileSync(result.jsonOut, 'utf8');
          const parsed = JSON.parse(jsonContent);
          const candidates = Array.isArray(parsed) ? parsed : (parsed.items || []);
          
          // Store full candidate data, not just tickers
          cache.setSnapshot(candidates);
          console.log(`✅ V2 Worker: Cache updated with ${candidates.length} candidates`);
          return { ok: true, count: candidates.length };
        } else {
          cache.setSnapshot([]);
          console.log(`⚠️ V2 Worker: No JSON output file found`);
          return { ok: true, count: 0 };
        }
      } catch (e) {
        cache.setError(e);
        console.error(`❌ V2 Worker: Parse error:`, e.message);
        throw new Error(`parse error: ${e.message}; stderr: ${result.stderr}`);
      }
    } else {
      // code 2 has been observed — record & reject so supervisor can backoff/retry
      const error = new Error(`exit ${code}: ${result.stderr}`);
      cache.setError(error);
      console.error(`❌ V2 Worker: Python exit ${code}:`, result.stderr.substring(0, 200));
      throw error;
    }
    
  } catch (error) {
    cache.setError(error);
    console.error(`❌ V2 Worker: Singleton error:`, error.message);
    throw error;
  }
}

function scheduleLoop() {
  if (!WORKERS_ENABLED) return console.log('[bg] V2 worker disabled (WORKERS_ENABLED=false)');
  
  let backoff = 5_000; // start small
  const maxBackoff = 120_000;

  async function tick() {
    try {
      await runOnce();
      backoff = REFRESH_MS; // success → normal cadence
    } catch (e) {
      // failure → exponential backoff
      backoff = Math.min(backoff * 2, maxBackoff);
      console.error(`❌ V2 Worker: Refresh failed, backing off ${backoff}ms:`, e.message);
    } finally {
      timer = setTimeout(tick, backoff);
    }
  }

  if (timer) clearTimeout(timer);
  console.log(`🚀 V2 Worker: Starting background loop (${REFRESH_MS}ms refresh)`);
  timer = setTimeout(tick, 1_000);
}

function stop() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    console.log(`🛑 V2 Worker: Stopped background loop`);
  }
}

module.exports = { scheduleLoop, stop };