const { readJsonSafe, writeJsonSafe } = require('./util');
const { polygonRequest } = require('./polygonRequest');

const cache = new Map();
const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function fromFile(symbol) {
  const j = readJsonSafe('liquidity.json');
  const v = j && j[symbol];
  if (!v) return null;
  
  return {
    liquidity_30d: +v.liquidity_30d,
    adv_30d_shares: +v.adv_30d_shares,
    asof: v.asof
  };
}

async function fromLive(symbol) {
  try {
    // Get 30-day aggregates for volume calculation
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    
    const endpoint = `/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000`;
    
    const data = await polygonRequest(endpoint);
    
    if (!data || !data.results || data.results.length === 0) return null;
    
    // Calculate 30-trading-day averages (ignore zero-volume days)
    let totalVolume = 0;
    let totalDollarVolume = 0;
    let validDays = 0;
    
    data.results.forEach(bar => {
      if (bar.v > 0 && bar.c > 0) {
        totalVolume += bar.v;
        totalDollarVolume += bar.v * bar.c;
        validDays++;
      }
    });
    
    if (validDays === 0) return null;
    
    return {
      liquidity_30d: Math.round(totalDollarVolume / validDays),
      adv_30d_shares: Math.round(totalVolume / validDays),
      asof: new Date().toISOString().split('T')[0]
    };
  } catch (e) {
    console.warn(`Polygon liquidity error for ${symbol}:`, e.message);
    return null;
  }
}

async function get(symbol) {
  const now = Date.now();
  const sym = (symbol || '').toUpperCase();
  const hit = cache.get(sym);
  if (hit && now - hit.t < TTL_MS) return hit.v;

  let v = await fromLive(sym);
  if (!v) v = fromFile(sym);

  cache.set(sym, { t: now, v });
  return v;
}

async function refreshAll(symbols) {
  console.log(`Refreshing liquidity for ${symbols.length} symbols`);
  
  const results = {};
  const batchSize = 3; // Conservative for Polygon aggregates
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (symbol) => {
        const data = await fromLive(symbol);
        if (data && data.adv_30d_shares) {
          results[symbol] = data;
        }
      })
    );
    
    // Rate limiting pause
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  if (Object.keys(results).length > 0) {
    writeJsonSafe('liquidity.json', results);
  }
  
  return results;
}

module.exports = { get, refreshAll };