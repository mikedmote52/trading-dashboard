const { readJsonSafe } = require('./util');
const { proxyShortInterest } = require('./shortinterest_proxy');
const cache = new Map(), TTL_MS = 12*60*60*1000; // 12h cache for proxy data

function fromFile(symbol) {
  const j = readJsonSafe('shortinterest.json');
  const v = j && j[symbol];
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

async function getWithContext(symbol, ctx) {
  const now = Date.now();
  const k = symbol.toUpperCase();
  const hit = cache.get(k);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = null;

  // 1. Try live feed (none now)
  // v = await liveProvider(k);

  // 2. Try proxy estimator with context
  if (!v && ctx) {
    v = await proxyShortInterest(k, ctx);
  }

  // 3. Fall back to static JSON cache
  if (!v) v = fromFile(k);

  cache.set(k, { t: now, v });
  return v;
}

module.exports = { get, getWithContext };