/**
 * Direct Discovery Worker - Scheduled bypass for production reliability
 * Runs the Python screener periodically and ingests discoveries directly
 */

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

function startDirectWorker() {
  console.log(`[direct_worker] 🚀 Starting discovery worker loop every ${PERIOD_MS}ms (${Math.round(PERIOD_MS/60000)}min)`);
  
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