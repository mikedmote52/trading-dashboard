// server/lib/screenerSingleton.js
const { runScreener } = require("./runScreener");
const { parseScreenerMetrics } = require("../services/prometheus_metrics");

let lock = false;
let lastResult = null;
let inflight = null;
let cbUntil = 0;  // Circuit breaker timestamp

async function runScreenerSingleton(opts) {
  if (lock) {
    console.log(`[screenerSingleton] Already running, awaiting in-flight result for caller: ${opts.caller}`);
    // return the in-flight promise so callers don't spawn duplicates
    return inflight;
  }
  
  const now = Date.now();
  if (now < cbUntil) {  // circuit open
    console.warn("[cb] polygon circuit open; forcing cached-only run");
    process.env.FORCE_CACHED_UNIVERSE = "1";
  }
  
  console.log(`[screenerSingleton] Starting new screener run for caller: ${opts.caller}`);
  lock = true;
  inflight = runScreener(opts)
    .then(res => {
      lastResult = res;
      console.log(`[screenerSingleton] Completed for caller: ${opts.caller}, code: ${res.code}, duration: ${res.durationMs}ms`);
      
      // Parse metrics from screener output
      parseScreenerMetrics(res.stderr, res.stdout);
      
      // Check for auth/entitlement errors and trigger circuit breaker
      const output = (res.stderr || "") + (res.stdout || "");
      if (/polygon_http_(401|403)/.test(output) || /unauthorized|forbidden|invalid api key/i.test(output)) {
        cbUntil = Date.now() + 5*60*1000; // 5 min for auth errors
        console.warn(`[cb] Auth/entitlement error detected, circuit open for 5 minutes`);
      } else if (/polygon_http_(500|502|503|504)/.test(output) || /timeout|connection error/i.test(output)) {
        cbUntil = Date.now() + 2*60*1000; // 2 min for server errors
        console.warn(`[cb] Server error detected, circuit open for 2 minutes`);
      }
      
      return res;
    })
    .finally(() => { 
      lock = false; 
      inflight = null; 
      // Clear forced cached mode
      if (process.env.FORCE_CACHED_UNIVERSE) {
        delete process.env.FORCE_CACHED_UNIVERSE;
      }
    });
  return inflight;
}

function getLastScreenerResult() { 
  return lastResult; 
}

module.exports = { runScreenerSingleton, getLastScreenerResult };