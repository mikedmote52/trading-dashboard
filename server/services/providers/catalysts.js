const fs = require('fs');
const path = require('path');

const TTL_MS = 12*60*60*1000;
const cache = new Map();

function fromFile(symbol) {
  const p = path.join(process.cwd(), 'data', 'providers', 'catalyst.json');
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = j[symbol];
  if (!v) return null;
  return {
    verified_in_window: !!v.verified_in_window,
    items: Array.isArray(v.items) ? v.items.slice(0, 3) : []
  };
}

async function get(symbol) {
  const now = Date.now();
  const k = symbol.toUpperCase();
  const hit = cache.get(k);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = null;

  // TODO live provider call with whitelist of catalyst types

  if (!v) v = fromFile(k);

  cache.set(k, { t: now, v });
  return v;
}

module.exports = { get };