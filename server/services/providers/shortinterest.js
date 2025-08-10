const fs = require('fs');
const path = require('path');

const cache = new Map();
const TTL_MS = 24*60*60*1000;

function fromFile(symbol) {
  const p = path.join(process.cwd(), 'data', 'providers', 'shortinterest.json');
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = j[symbol];
  if (!v) return null;
  return {
    short_interest_shares: +v.short_interest_shares,
    short_interest_pct: +v.short_interest_pct,
    days_to_cover: +v.days_to_cover,
    asof: v.asof
  };
}

async function get(symbol) {
  const now = Date.now();
  const k = symbol.toUpperCase();
  const hit = cache.get(k);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = null;

  // TODO live provider call
  // v = await liveProvider(k);

  if (!v) v = fromFile(k);

  cache.set(k, { t: now, v });
  return v;
}

module.exports = { get };