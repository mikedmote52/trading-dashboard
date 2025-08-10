const { readJsonSafe, writeJsonSafe } = require('./util');
const { polygonRequest } = require('./polygonRequest');

const cache = new Map();
const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function fromFile(symbol) {
  const j = readJsonSafe('fundamentals.json');
  const v = j && j[symbol];
  if (!v) return null;
  
  return {
    float_shares: +v.float_shares,
    market_cap: +v.market_cap,
    shares_outstanding: +v.shares_outstanding,
    asof: v.asof
  };
}

async function fromLive(symbol) {
  try {
    const sym = String(symbol || '').toUpperCase();
    // date matters on v3 reference; use today to let Polygon choose latest available
    const date = new Date().toISOString().slice(0,10);

    // try detailed reference first
    let ref = await polygonRequest(`/v3/reference/tickers/${sym}?date=${date}`);
    // some accounts only have the list endpoint; fall back to list query
    if (!ref || (!ref.results && !ref.ticker)) {
      const list = await polygonRequest(`/v3/reference/tickers?ticker=${sym}&active=true&limit=1`);
      ref = list;
    }

    const r = ref?.results?.ticker ? ref.results : ref?.results?.[0] || ref?.ticker ? ref : null;
    if (!r) return null;

    const float =
      r.share_class_shares_outstanding ??
      r.weighted_shares_outstanding ??
      r.shares_outstanding ??
      null;

    if (!float || !Number.isFinite(float)) return null;

    return {
      float_shares: Math.round(float),
      market_cap: r.market_cap,
      shares_outstanding: r.shares_outstanding,
      asof: new Date().toISOString().split('T')[0]
    };
  } catch (e) {
    console.warn(`Polygon fundamentals error for ${symbol}:`, e.message);
    return null;
  }
}

async function get(symbol) {
  const now = Date.now();
  const k = symbol.toUpperCase();
  const hit = cache.get(k);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = await fromLive(k);
  if (!v) v = fromFile(k);

  cache.set(k, { t: now, v });
  return v;
}

async function refreshAll(symbols) {
  console.log(`Refreshing fundamentals for ${symbols.length} symbols`);
  
  const results = {};
  const batchSize = 5; // Polygon rate limits
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (symbol) => {
        const data = await fromLive(symbol);
        if (data && data.float_shares) {
          results[symbol] = data;
        }
      })
    );
    
    // Rate limiting pause
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  if (Object.keys(results).length > 0) {
    writeJsonSafe('fundamentals.json', results);
  }
  
  return results;
}

async function getCompanyProfile(symbol) {
  try {
    const data = await polygonRequest(`/v3/reference/tickers/${symbol}`);
    if (!data || !data.results) return null;
    
    const r = data.results;
    
    return {
      float_shares: r.share_class_shares_outstanding || r.weighted_shares_outstanding || null,
      market_cap: r.market_cap || null,
      name: r.name || symbol,
      ticker: symbol.toUpperCase()
    };
  } catch (e) {
    console.warn(`getCompanyProfile error for ${symbol}:`, e.message);
    return null;
  }
}

module.exports = { get, refreshAll, getCompanyProfile };