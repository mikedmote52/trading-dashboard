const fs = require("fs");
const path = require("path");
const { runScreenerSingleton } = require("../../lib/screenerSingleton");

const REFRESH_MS = parseInt(process.env.REFRESH_MS || "120000", 10);
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || "180000", 10);

// Parse default args
const DEFAULT_ARGS = (process.env.SCREENER_ARGS || "--limit 50 --json-out --exclude-symbols BTAI,KSS,UP,TNXP").split(" ").filter(Boolean);
let DEFAULT_LIMIT = 50;
const limitArg = DEFAULT_ARGS.find(arg => arg.startsWith('--limit'));
if (limitArg) {
  const match = limitArg.match(/--limit[=\s]?(\d+)/);
  if (match) DEFAULT_LIMIT = parseInt(match[1]);
}

let cache = { items: [], updatedAt: 0, running: false, lastErr: null, meta: null };

function parseSafe(stdout) {
  const parsed = JSON.parse(stdout);
  // Handle new format with metadata
  if (parsed.run_id && parsed.items) {
    cache.meta = {
      run_id: parsed.run_id,
      snapshot_ts: parsed.snapshot_ts,
      params: parsed.params
    };
    return parsed.items.map(x => ({
      ...x,
      ticker: x.ticker || x.symbol,
      price: Number(x.price ?? x.last ?? 0),
      score: Number(x.score ?? 0),
    }));
  }
  // Fallback for old format
  const arr = Array.isArray(parsed) ? parsed : (parsed.items || []);
  return arr.map(x => ({
    ...x,
    ticker: x.ticker || x.symbol,
    price: Number(x.price ?? x.last ?? 0),
    score: Number(x.score ?? 0),
  }));
}

function sortSafe(items) {
  return [...items].sort((a, b) =>
    (Number(b.score||0) - Number(a.score||0)) ||
    (Number(b.indicators?.relvol ?? 0) - Number(a.indicators?.relvol ?? 0))
  );
}

async function runOnce() {
  if (cache.running) return false;
  cache.running = true; cache.lastErr = null;

  try {
    const result = await runScreenerSingleton({
      limit: DEFAULT_LIMIT,
      budgetMs: 60000,
      jsonOut: '/tmp/alphastack_screener.json',
      caller: 'py_adapter'
    });
    
    if (result.code !== 0) {
      cache.lastErr = `screener exit ${result.code}: ${result.stderr.slice(0,2000)}`;
      cache.running = false;
      return false;
    }

    // Read JSON output
    if (fs.existsSync(result.jsonOut)) {
      const jsonContent = fs.readFileSync(result.jsonOut, 'utf8');
      const parsed = JSON.parse(jsonContent);
      const items = sortSafe(parseSafe(jsonContent));
      
      // Defensive guard against alphabetical bleed‑through
      const first = items.slice(0,12).map(i => i.ticker||"");
      const looksAlpha = first.join(",") === [...first].sort().join(",");
      cache.items = looksAlpha ? [] : items;
      cache.updatedAt = Date.now();
      
      // Save snapshot to disk if we have metadata
      if (parsed.run_id && parsed.items) {
        const payload = { ...parsed, items: cache.items };
        fs.mkdirSync('tmp/snapshots', { recursive: true });
        const snapPath = `tmp/snapshots/alphastack_${parsed.run_id.replace(/[^a-zA-Z0-9-]/g, '_')}.json`;
        fs.writeFileSync(snapPath, JSON.stringify(payload, null, 2));
        cache.snapPath = snapPath;
        console.log(`📸 Snapshot saved: ${snapPath}`);
      }
    }
  } catch (error) {
    cache.lastErr = error.message;
  } finally {
    cache.running = false;
  }
  return true;
}

function getState(limit = 50) {
  const fresh = Date.now() - cache.updatedAt <= CACHE_TTL_MS;
  return {
    items: cache.items.slice(0, limit),
    updatedAt: new Date(cache.updatedAt).toISOString(),
    running: cache.running,
    error: cache.lastErr,
    fresh,
    engine: "python_v2",
    run_id: cache.meta?.run_id,
    snapshot_ts: cache.meta?.snapshot_ts,
    params: cache.meta?.params,
    snapPath: cache.snapPath
  };
}

function startLoop() {
  runOnce();
  setInterval(() => runOnce(), REFRESH_MS);
}

module.exports = { startLoop, getState, runOnce };