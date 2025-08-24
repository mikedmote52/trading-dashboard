/**
 * Direct Discovery Worker - Scheduled bypass for production reliability
 * Runs the Python screener periodically and ingests discoveries directly
 */

// Never run on web dyno
if (process.env.DIRECT_WORKER_ENABLED !== 'true') {
  module.exports = {
    startDirectWorker() { 
      console.warn('[discovery_direct_worker] disabled on web'); 
    },
    getLastDirectRun: () => ({ ts: null, count: 0, err: 'disabled_on_web' })
  };
  return;
}

const { ingestDirect } = require("../jobs/screener_direct_ingest");

const PERIOD_MS = Number(process.env.DIRECT_WORKER_PERIOD_MS ?? 120000); // 2 minutes default
let running = false;
let lastDirectRun = { ts: null, count: 0, err: null };

async function tick() {
  if (running) return;
  running = true;
  
  const startTime = Date.now();
  try {
    console.log(`[direct_worker] Starting scheduled discovery scan...`);
    const result = await ingestDirect(10, 12000);
    const count = result.count || 0;
    
    lastDirectRun = {
      ts: new Date().toISOString(),
      count,
      err: null
    };
    
    console.log(`[direct_worker] ✅ Completed: inserted=${count} discoveries`);
    
    // Report success to health monitor
    try {
      const { recordSuccess } = require("../services/health_monitor");
      recordSuccess('bypass_worker', { count, duration: Date.now() - startTime });
    } catch (e) {
      // Health monitor not critical for core functionality
    }
  } catch (e) {
    lastDirectRun = {
      ts: new Date().toISOString(), 
      count: 0,
      err: e.message
    };
    console.error("[direct_worker] ❌ Error:", e.message);
    
    // Report failure to health monitor
    try {
      const { recordFailure } = require("../services/health_monitor");
      recordFailure('bypass_worker', e);
    } catch (err) {
      // Health monitor not critical for core functionality
    }
  } finally {
    running = false;
  }
}

async function startDirectWorker() {
  console.log(`[direct_worker] 🚀 Starting discovery worker loop every ${PERIOD_MS}ms (${Math.round(PERIOD_MS/60000)}min)`);
  
  const strictFeeds = process.env.SCREENER_STRICT_FEEDS === "true";
  const budgetMs = Number(process.env.SCREENER_BUDGET_MS || 12000);
  
  // Try boot screener but don't fail hard
  try {
    const { runScreenerSingleton } = require("../lib/screenerSingleton");
    await runScreenerSingleton({
      caller: "worker_boot",
      limit: 10,
      budgetMs,
      jsonOut: "/tmp/discovery_screener.json",
    });
    console.log(`[direct_worker] Boot screener succeeded`);
  } catch (e) {
    if (strictFeeds) {
      console.error(`[direct_worker] Boot screener failed in strict mode:`, e.message);
      throw e;
    }
    console.warn(`[direct_worker] Boot screener failed in degraded mode — continuing:`, e.message || e);
  }
  
  // Run first tick immediately
  tick();
  
  // Then schedule regular intervals
  setInterval(tick, PERIOD_MS);
}

function getLastDirectRun() {
  return lastDirectRun;
}

module.exports = {
  startDirectWorker,
  getLastDirectRun
};