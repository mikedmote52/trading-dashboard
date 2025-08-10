const { readJsonSafe } = require('./util');
const { fetchFinraShortVolume } = require('./finra_fetch');

async function getFinraShortVol(symbol) {
  // Try to read from cache first
  let data = readJsonSafe('finra_shortvol.json');
  
  if (!data) {
    // Fetch fresh data if cache doesn't exist
    data = await fetchFinraShortVolume();
  }
  
  return data && data[symbol] ? data[symbol] : null;
}

function estimateShortInterest(symbol, context) {
  const { sv_20d, sv_5d, float_shares, adv_30d_shares, borrow_fee_pct = 0, borrow_fee_trend_pp7d = 0 } = context;
  
  // Use 20-day average, fallback to 5-day
  const shortVol = sv_20d || sv_5d;
  if (!shortVol || !float_shares || !adv_30d_shares) {
    return null;
  }
  
  // Calculate pressure multiplier based on borrow costs and trends
  const press = Math.max(0.8, Math.min(1.8, 1 + 0.02 * borrow_fee_pct + 0.1 * borrow_fee_trend_pp7d));
  
  // Estimate short interest shares (capped at 90% of float)
  const est_shares = Math.min(Math.round(shortVol * press), 0.9 * float_shares);
  
  // Calculate percentage and days to cover
  const est_pct = float_shares ? 100 * est_shares / float_shares : null;
  const est_dtc = adv_30d_shares ? est_shares / adv_30d_shares : null;
  
  if (est_pct === null || est_dtc === null) {
    return null;
  }
  
  return {
    short_interest_shares: est_shares,
    short_interest_pct: +est_pct.toFixed(2),
    days_to_cover: +est_dtc.toFixed(2),
    asof: new Date().toISOString().split('T')[0],
    provenance: "finra-proxy"
  };
}

async function proxyShortInterest(symbol, context) {
  try {
    // Get FINRA short volume data
    const finraData = await getFinraShortVol(symbol);
    if (!finraData) {
      return null;
    }
    
    // Merge FINRA data with context
    const fullContext = {
      ...context,
      sv_5d: finraData.sv_5d,
      sv_20d: finraData.sv_20d,
      svr_5d: finraData.svr_5d,
      svr_20d: finraData.svr_20d
    };
    
    return estimateShortInterest(symbol, fullContext);
  } catch (e) {
    console.warn(`Proxy short interest estimation failed for ${symbol}:`, e.message);
    return null;
  }
}

module.exports = { proxyShortInterest, estimateShortInterest, getFinraShortVol };