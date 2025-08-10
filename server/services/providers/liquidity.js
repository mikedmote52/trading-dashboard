const { readJsonSafe } = require('./util');
const cache = new Map(), TTL_MS = 24*60*60*1000;

function fromFile(symbol) {
  const j = readJsonSafe('liquidity.json');
  const v = j && j[symbol];
  return v ? { liquidity_30d: +v.liquidity_30d, adv_30d_shares: +v.adv_30d_shares, asof: v.asof } : null;
}

async function get(symbol) {
  const now = Date.now();
  const k = symbol.toUpperCase();
  const hit = cache.get(k);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = null;

  // TODO live provider call

  if (!v) v = fromFile(k);

  cache.set(k, { t: now, v });
  return v;
}

module.exports = { get };