const { readJsonSafe } = require('./util');
const TTL_MS = 12*60*60*1000, cache = new Map();

function fromFile(symbol) {
  const j = readJsonSafe('catalyst.json');
  const v = j && j[symbol];
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
  
  // If no catalyst found, return a neutral placeholder
  // This prevents blocking stocks that don't have catalyst data
  if (!v) {
    v = {
      verified_in_window: false,
      date_valid: false,
      days_to_event: 999, // Outside any reasonable window
      items: [],
      placeholder: true // Mark as placeholder data
    };
  }

  cache.set(k, { t: now, v });
  return v;
}

module.exports = { get };