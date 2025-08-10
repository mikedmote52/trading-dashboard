const fs = require('fs');
const path = require('path');

const cache = new Map();
const TTL_MS = 24*60*60*1000;

function fromFile(symbol) {
  const p = path.join(process.cwd(), 'data', 'providers', 'borrow.json');
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = j[symbol];
  return v ? { borrow_fee_pct: +v.borrow_fee_pct, borrow_fee_trend_pp7d: +v.borrow_fee_trend_pp7d, asof: v.asof } : null;
}

async function get(symbol) {
  const now = Date.now();
  const k = symbol.toUpperCase();
  const hit = cache.get(k);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = null;

  // TODO live provider call here, return same shape on success
  // v = await liveProvider(k);

  if (!v) v = fromFile(k);

  cache.set(k, { t: now, v });
  return v;
}

module.exports = { get };