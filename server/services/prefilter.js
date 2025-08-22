/**
 * Prefilter Service - Cheap Vectorized Universe Screening
 * Filters 200+ stocks down to 10-20 qualified VIGL candidates
 */

// Environment-based configuration with relaxed defaults for production bootstrap
const CONFIG = {
  enforcePriceCap: process.env.PREFILTER_ENFORCE_PRICE_CAP === 'true',
  priceCap: Number(process.env.PREFILTER_PRICE_CAP ?? 1000),
  minPrice: Number(process.env.PREFILTER_MIN_PRICE ?? 1),
  minRVOL: Number(process.env.PREFILTER_MIN_REL_VOL ?? 0.5),
  minLiquidity: Number(process.env.PREFILTER_MIN_LIQUIDITY ?? 100000),
  minAvgVol: Number(process.env.PREFILTER_MIN_AVG_VOL ?? 300000),
  minAtrPct: Number(process.env.PREFILTER_MIN_ATR_PCT ?? 1.0),
  rsiMin: Number(process.env.PREFILTER_RSI_MIN ?? 30),
  rsiMax: Number(process.env.PREFILTER_RSI_MAX ?? 80),
  topK: Number(process.env.PREFILTER_TOP_K ?? 20),
  topFallback: Number(process.env.PREFILTER_TOP_FALLBACK ?? 10),
  minShortInterest: Number(process.env.PREFILTER_MIN_SHORT_INTEREST ?? 0.1),
  altSqueeze: {
    floatMaxM: Number(process.env.PREFILTER_ALT_SQUEEZE_FLOAT_MAX_M ?? 50),
    util: Number(process.env.PREFILTER_ALT_SQUEEZE_UTIL ?? 80),
    fee: Number(process.env.PREFILTER_ALT_SQUEEZE_FEE ?? 10)
  }
};

// Rejection telemetry  
const rejectCounters = {price:0, avgVol:0, relVol:0, atr:0, rsi:0, blacklist:0, other:0};

function reject(reason) {
  rejectCounters[reason] = (rejectCounters[reason] || 0) + 1;
}

function resetCounters() {
  Object.keys(rejectCounters).forEach(k => rejectCounters[k] = 0);
}

/**
 * Prefilter universe using cheap screening criteria before expensive feature fetching
 * @param {Array} tickers Raw ticker data with price/volume from market snapshot
 * @returns {Object} { ranked: Array<string>, metrics: Object }
 */
function prefilterUniverse(tickers) {
  if (!tickers || tickers.length === 0) {
    console.log('⚠️ No tickers provided for prefiltering');
    return { ranked: [], metrics: { universe: 0, candidates: 0 } };
  }
  
  console.log(`🎯 Starting prefilter on ${tickers.length} universe stocks`);
  
  // Calculate relative volume for each ticker
  const withRVOL = tickers.map(t => {
    const price = t.day?.c || 0;
    const volume = t.day?.v || 0;
    const prevVolume = t.prevDay?.v || volume;
    const relativeVolume = prevVolume > 0 ? volume / prevVolume : 1.0;
    const priceChange = Math.abs(price - (t.prevDay?.c || price));
    const changePercent = t.prevDay?.c ? priceChange / t.prevDay.c : 0;
    
    return {
      ...t,
      price,
      volume, 
      relativeVolume,
      changePercent,
      score: relativeVolume * (1 + changePercent) // Momentum score for ranking
    };
  });
  
  // Reset rejection counters for this run
  resetCounters();
  
  // Apply VIGL screening criteria with telemetry
  const candidates = withRVOL.filter(t => {
    try {
      // Price filters
      if (t.price <= 0) { reject('price'); return false; }
      if (t.price < CONFIG.minPrice) { reject('price'); return false; }
      if (CONFIG.enforcePriceCap && t.price > CONFIG.priceCap) { reject('price'); return false; }
      
      // Volume filters  
      if (t.relativeVolume < CONFIG.minRVOL) { reject('relVol'); return false; }
      if (t.volume < CONFIG.minLiquidity) { reject('avgVol'); return false; }
      
      // Passed all filters
      console.log(`✅ Prefilter PASS: ${t.ticker} - Price: $${t.price.toFixed(2)}, RVOL: ${t.relativeVolume.toFixed(2)}x, Vol: ${(t.volume/1000).toFixed(0)}K`);
      return true;
    } catch (err) {
      reject('other');
      return false;
    }
  });
  
  // Rank by momentum score (RVOL × price change) and take top K
  let ranked = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.topK)
    .map(t => t.ticker);
  
  // Apply no-candidate failsafe
  if (ranked.length === 0) {
    console.warn('🚨 [prefilter] 0 candidates passed - applying fallback strategy');
    
    // Sample first 5 rejected for debugging
    const sample = withRVOL.slice(0, 5).map(s => ({
      t: s.ticker, p: s.price, relVol: s.relativeVolume, vol: s.volume
    }));
    console.warn('[prefilter] sample rejected stocks:', sample);
    
    // Fallback: Top N by dollar volume (liquid stocks)
    const fallbackCandidates = withRVOL
      .filter(t => t.price > 1 && t.volume > 100000)
      .sort((a, b) => (b.price * b.volume) - (a.price * a.volume))
      .slice(0, CONFIG.topFallback)
      .map(t => t.ticker);
    
    ranked = fallbackCandidates;
    console.log(`🆘 Fallback applied: selected ${ranked.length} liquid stocks: ${ranked.join(', ')}`);
  }
  
  console.log(`🎯 [prefilter] kept=${ranked.length} / ${tickers.length} rejections=`, rejectCounters);
  console.log(`🎯 Final candidates: ${ranked.join(', ')}`);
  
  return {
    ranked,
    metrics: {
      universe: tickers.length,
      candidates: candidates.length,
      selected: ranked.length,
      rejections: {...rejectCounters}
    }
  };
}

/**
 * Enhanced prefilter that includes short interest screening (when data available)
 * @param {Array} tickers Raw ticker data
 * @param {Object} shortData Optional short interest data {symbol: {si, util, fee, float}}
 * @returns {Object} { ranked: Array<string>, metrics: Object }
 */
function prefilterWithShortData(tickers, shortData = {}) {
  if (!tickers || tickers.length === 0) {
    return { ranked: [], metrics: { universe: 0, candidates: 0 } };
  }
  
  console.log(`🎯 Starting enhanced prefilter with short data on ${tickers.length} stocks`);
  
  // Calculate metrics and apply all filters
  const withMetrics = tickers.map(t => {
    const price = t.day?.c || 0;
    const volume = t.day?.v || 0;
    const prevVolume = t.prevDay?.v || volume;
    const relativeVolume = prevVolume > 0 ? volume / prevVolume : 1.0;
    const changePercent = Math.abs(price - (t.prevDay?.c || price)) / (t.prevDay?.c || price || 1);
    
    // Short squeeze metrics
    const shortInfo = shortData[t.ticker] || {};
    const shortInterest = shortInfo.si || 0;
    const utilization = shortInfo.util || 0;
    const borrowFee = shortInfo.fee || 0;
    const floatM = shortInfo.floatM || 999;
    
    return {
      ...t,
      price,
      volume,
      relativeVolume,
      changePercent,
      shortInterest,
      utilization, 
      borrowFee,
      floatM,
      score: relativeVolume * (1 + changePercent) * (1 + shortInterest) // Enhanced momentum score
    };
  });
  
  // Reset rejection counters for this run
  resetCounters();
  
  // Apply comprehensive VIGL filters with telemetry
  const candidates = withMetrics.filter(t => {
    try {
      // Price filters
      if (t.price <= 0) { reject('price'); return false; }
      if (t.price < CONFIG.minPrice) { reject('price'); return false; }
      if (CONFIG.enforcePriceCap && t.price > CONFIG.priceCap) { reject('price'); return false; }
      
      // Volume filters
      if (t.relativeVolume < CONFIG.minRVOL) { reject('relVol'); return false; }
      if (t.volume < CONFIG.minLiquidity) { reject('avgVol'); return false; }
      
      // Short squeeze criteria (if data available)
      const hasShortData = t.shortInterest > 0 || t.utilization > 0;
      if (hasShortData && t.shortInterest < CONFIG.minShortInterest) { reject('other'); return false; }
      
      // Alternative squeeze criteria
      const altSqueeze = (t.floatM <= CONFIG.altSqueeze.floatMaxM) || 
                        (t.utilization >= CONFIG.altSqueeze.util && t.borrowFee >= CONFIG.altSqueeze.fee);
      if (hasShortData && !altSqueeze) { reject('other'); return false; }
      
      // Passed all filters
      console.log(`✅ Enhanced PASS: ${t.ticker} - Price: $${t.price.toFixed(2)}, RVOL: ${t.relativeVolume.toFixed(2)}x, SI: ${(t.shortInterest*100).toFixed(1)}%`);
      return true;
    } catch (err) {
      reject('other');
      return false;
    }
  });
  
  // Rank and select top candidates
  let ranked = candidates
    .sort((a, b) => b.score - a.score)  
    .slice(0, CONFIG.topK)
    .map(t => t.ticker);
  
  // Apply no-candidate failsafe
  if (ranked.length === 0) {
    console.warn('🚨 [prefilter enhanced] 0 candidates passed - applying fallback strategy');
    
    // Sample first 5 rejected for debugging
    const sample = withMetrics.slice(0, 5).map(s => ({
      t: s.ticker, p: s.price, relVol: s.relativeVolume, vol: s.volume, si: s.shortInterest
    }));
    console.warn('[prefilter enhanced] sample rejected stocks:', sample);
    
    // Fallback: Top N by enhanced score (liquid stocks with potential)
    const fallbackCandidates = withMetrics
      .filter(t => t.price > 1 && t.volume > 100000)
      .sort((a, b) => (b.price * b.volume * (1 + b.shortInterest)) - (a.price * a.volume * (1 + a.shortInterest)))
      .slice(0, CONFIG.topFallback)
      .map(t => t.ticker);
    
    ranked = fallbackCandidates;
    console.log(`🆘 Enhanced fallback applied: selected ${ranked.length} liquid stocks: ${ranked.join(', ')}`);
  }
  
  console.log(`🎯 [prefilter enhanced] kept=${ranked.length} / ${tickers.length} rejections=`, rejectCounters);
  
  return {
    ranked,
    candidateData: candidates.slice(0, CONFIG.topK), // Include full data for downstream use
    metrics: {
      universe: tickers.length,
      candidates: candidates.length,
      selected: ranked.length,
      withShortData: candidates.filter(c => c.shortInterest > 0).length,
      rejections: {...rejectCounters}
    }
  };
}

module.exports = {
  prefilterUniverse,
  prefilterWithShortData
};