const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PY = process.env.PYTHON_BIN || "python3";
const SCRIPT = process.env.SCREENER_SCRIPT || "agents/universe_screener_v2.py";
const ARGS = (process.env.SCREENER_ARGS || "").split(" ").filter(Boolean);
const REFRESH_MS = parseInt(process.env.REFRESH_MS || "120000", 10);
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || "180000", 10);

// Defensively add seed if missing
if (!ARGS.includes('--seed')) {
  ARGS.push('--seed', '1337');
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

function runOnce() {
  if (cache.running) return false;
  cache.running = true; cache.lastErr = null;

  const child = spawn(PY, [SCRIPT, ...ARGS], { stdio: ["ignore","pipe","pipe"] });
  let out = "", err = "";
  child.stdout.on("data", d => out += d.toString());
  child.stderr.on("data", d => err += d.toString());
  child.on("close", code => {
    cache.running = false;
    if (code !== 0) { cache.lastErr = `screener exit ${code}: ${err.slice(0,2000)}`; return; }
    try {
      const parsed = JSON.parse(out);
      const items = sortSafe(parseSafe(out));
      
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
    } catch (e) { cache.lastErr = e.message; }
  });
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