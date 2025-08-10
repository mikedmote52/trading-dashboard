const { readJsonSafe, writeJsonSafe } = require('./util');
const cache = new Map();
const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function fromFile(symbol) {
  const j = readJsonSafe('borrow.json');
  const v = j && j[symbol];
  if (!v) return null;
  
  return {
    borrow_fee_pct: +v.borrow_fee_pct,
    borrow_fee_trend_pp7d: +v.borrow_fee_trend_pp7d,
    utilization_pct: +v.utilization_pct,
    asof: v.asof
  };
}

function generatePlaceholderData(symbol) {
  // Generate realistic but synthetic borrow data
  // Base fee varies by symbol hash for consistency
  const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const baseFee = 2 + (hash % 20); // 2-22% range
  
  // Add some randomness but keep it deterministic per day
  const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const seed = hash + dayOfYear;
  const variance = (seed % 10) - 5; // -5 to +5 percentage points
  
  return {
    borrow_fee_pct: Math.max(0.1, baseFee + variance),
    borrow_fee_trend_pp7d: (seed % 21) - 10, // -10 to +10 pp7d trend
    utilization_pct: Math.min(100, Math.max(5, 60 + (seed % 40))), // 5-100% utilization
    asof: new Date().toISOString().split('T')[0],
    provenance: 'placeholder'
  };
}

async function get(symbol) {
  const now = Date.now();
  const k = symbol.toUpperCase();
  const hit = cache.get(k);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = null;

  // TODO: Replace with live provider call when available
  // v = await liveProvider(k);

  // Try cached file first
  if (!v) v = fromFile(k);
  
  // Generate placeholder data if no cached data
  if (!v) v = generatePlaceholderData(k);

  cache.set(k, { t: now, v });
  return v;
}

async function refreshAll(symbols) {
  console.log(`Generating placeholder borrow data for ${symbols.length} symbols`);
  
  const results = {};
  
  symbols.forEach(symbol => {
    results[symbol] = generatePlaceholderData(symbol);
  });
  
  if (Object.keys(results).length > 0) {
    writeJsonSafe('borrow.json', results);
  }
  
  return results;
}

module.exports = { get, refreshAll };