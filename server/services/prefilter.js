/**
 * Prefilter Service - Cheap Vectorized Universe Screening
 * Filters 200+ stocks down to 10-20 qualified VIGL candidates
 */

const { DISCOVERY } = require('../../config/discovery');

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
  
  // Apply VIGL screening criteria
  const candidates = withRVOL.filter(t => {
    // Price cap filter (explosive growth potential)
    const passesPrice = t.price > 0 && (!DISCOVERY.enforcePriceCap || t.price <= DISCOVERY.priceCap);
    
    // Volume filters
    const passesVolume = t.relativeVolume >= DISCOVERY.minRVOL;
    const passesLiquidity = t.volume >= DISCOVERY.minLiquidity;
    
    // Basic screening
    const passesBasic = passesPrice && passesVolume && passesLiquidity;
    
    if (passesBasic) {
      console.log(`✅ Prefilter PASS: ${t.ticker} - Price: $${t.price.toFixed(2)}, RVOL: ${t.relativeVolume.toFixed(2)}x, Vol: ${(t.volume/1000).toFixed(0)}K`);
    }
    
    return passesBasic;
  });
  
  // Rank by momentum score (RVOL × price change) and take top K
  const ranked = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, DISCOVERY.topK)
    .map(t => t.ticker);
  
  console.log(`🎯 Prefilter results: ${candidates.length} passed screening, top ${ranked.length} selected`);
  console.log(`🎯 Final candidates: ${ranked.join(', ')}`);
  
  return {
    ranked,
    metrics: {
      universe: tickers.length,
      candidates: candidates.length,
      selected: ranked.length
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
  
  // Apply comprehensive VIGL filters
  const candidates = withMetrics.filter(t => {
    const passesPrice = t.price > 0 && (!DISCOVERY.enforcePriceCap || t.price <= DISCOVERY.priceCap);
    const passesVolume = t.relativeVolume >= DISCOVERY.minRVOL;
    const passesLiquidity = t.volume >= DISCOVERY.minLiquidity;
    
    // Short squeeze criteria (if data available)
    const hasShortData = t.shortInterest > 0 || t.utilization > 0;
    const passesShortInterest = !hasShortData || t.shortInterest >= DISCOVERY.minShortInterest;
    
    // Alternative squeeze criteria
    const altSqueeze = (t.floatM <= DISCOVERY.altSqueeze.floatMaxM) || 
                      (t.utilization >= DISCOVERY.altSqueeze.util && t.borrowFee >= DISCOVERY.altSqueeze.fee);
    const passesSqueezeAlt = !hasShortData || altSqueeze;
    
    const passes = passesPrice && passesVolume && passesLiquidity && passesShortInterest && passesSqueezeAlt;
    
    if (passes) {
      console.log(`✅ Enhanced PASS: ${t.ticker} - Price: $${t.price.toFixed(2)}, RVOL: ${t.relativeVolume.toFixed(2)}x, SI: ${(t.shortInterest*100).toFixed(1)}%`);
    }
    
    return passes;
  });
  
  // Rank and select top candidates
  const ranked = candidates
    .sort((a, b) => b.score - a.score)  
    .slice(0, DISCOVERY.topK)
    .map(t => t.ticker);
    
  console.log(`🎯 Enhanced prefilter: ${candidates.length} passed all criteria, top ${ranked.length} selected`);
  
  return {
    ranked,
    candidateData: candidates.slice(0, DISCOVERY.topK), // Include full data for downstream use
    metrics: {
      universe: tickers.length,
      candidates: candidates.length,
      selected: ranked.length,
      withShortData: candidates.filter(c => c.shortInterest > 0).length
    }
  };
}

module.exports = {
  prefilterUniverse,
  prefilterWithShortData
};