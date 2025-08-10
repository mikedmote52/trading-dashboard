const { readJsonSafe } = require('./util');
const { fetchLatestShortvol } = require('./finra_fetch');

// Symbol normalization
function norm(sym){ return String(sym||'').toUpperCase().replace(/[.\-].*$/, ''); }

function sumTapes(rows){
  // rows may be an array like [{symbol:'AEVA', short_volume:.., total_volume:.., tape:'A'}, …]
  if (!Array.isArray(rows)) return rows;
  const acc = {};
  for (const r of rows){
    const k = norm(r.symbol);
    if (!acc[k]) acc[k] = { short_volume: 0, total_volume: 0 };
    acc[k].short_volume += Number(r.short_volume||0);
    acc[k].total_volume += Number(r.total_volume||0);
  }
  return acc;
}

// Keep legacy name but delegate to the real proxy (no 0.9 cap)
async function estimateShortInterest(symbol, context) {
  return proxyShortInterest(symbol, context);
}

async function proxyShortInterest(symbol, context) {
  try {
    if (!context?.adv_30d_shares || !context?.float_shares) return null;
    
    // Add timeout protection for production deployment
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('FINRA fetch timeout')), 10000)
    );
    
    const fetchPromise = fetchLatestShortvol(5);
    const { date, data } = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!data) return null;

    const map = sumTapes(data);                // collapse A/B/C if needed
    const row = Array.isArray(map) ? null : map[norm(symbol)];
    if (!row || !row.sv_20d || !row.svr_20d) return null;

    const pctShortOfVol = row.svr_20d;                // 0..1
    const impliedShortShares = Math.min(pctShortOfVol * context.float_shares,
                                        context.float_shares);
    return {
      short_interest_shares: Math.round(impliedShortShares),
      short_interest_pct: +(100 * impliedShortShares / context.float_shares).toFixed(2),
      days_to_cover: +(impliedShortShares / context.adv_30d_shares).toFixed(2),
      asof: new Date().toISOString().split('T')[0],
      provenance: 'finra-proxy',
      basis_date: date
    };
  } catch (e) {
    // Fail gracefully in production - don't crash the entire deployment
    if (process.env.NODE_ENV === 'production') {
      console.warn(`FINRA proxy unavailable for ${symbol} (production deployment issue)`);
    } else {
      console.warn(`Proxy short interest estimation failed for ${symbol}:`, e.message);
    }
    return null;
  }
}

module.exports = { proxyShortInterest, estimateShortInterest };