/**
 * AlphaStack → DiscoveryV1 Adapter
 * 
 * Normalizes AlphaStack enriched discovery items into canonical DiscoveryV1 schema
 */

const { safeValidateDiscovery } = require("../schemas/discovery");
const { 
  extractTicker, 
  normalizeScore, 
  nzPositive, 
  nz, 
  nzPercent,
  toConfidence, 
  safeString, 
  safeStringArray,
  extractMeta 
} = require("../schemas/adapter");

function adaptAlphaStackItem(x) {
  // Extract core fields
  const ticker = extractTicker(x);
  const score = normalizeScore(x.score, 60);
  const price = nzPositive(x.price);
  
  // Determine confidence based on enrichment success (relaxed for ALLOW_LOW_CONF)
  let confidence = "low";
  if (typeof x.confidence === "string") {
    confidence = x.confidence === "high" ? "high" : "low";
  } else if (typeof x.confidence === "boolean") {
    confidence = x.confidence ? "high" : "low";
  } else {
    // Infer confidence from data richness - relaxed criteria when ALLOW_LOW_CONF=true
    const hasRichData = x.relVol !== undefined || x.shortInterest !== undefined || x.ivPercentile !== undefined;
    const hasMinimalErrors = (!x.enrichErrors || x.enrichErrors.length < 2);
    const allowLowConf = process.env.ALLOW_LOW_CONF === 'true';
    
    if (allowLowConf) {
      // More permissive: any data available or minimal errors
      confidence = (hasRichData || hasMinimalErrors) ? "high" : "low";
    } else {
      // Strict: require both rich data AND minimal errors
      confidence = hasRichData && hasMinimalErrors ? "high" : "low";
    }
  }
  
  // Extract market microstructure
  const relVol = nzPositive(x.relVol);
  const atrPct = null; // Not typically provided by AlphaStack
  const rsi = null; // Would need to be added to enrichment
  const vwapDistPct = null; // Would need to be added to enrichment
  
  // Extract short squeeze indicators
  const shortInterestPct = nzPercent(x.shortInterest ? x.shortInterest * 100 : null);
  const borrowFeePct = nzPercent(x.borrowFee ? x.borrowFee * 100 : null);
  const utilizationPct = nzPercent(x.utilization ? x.utilization * 100 : null);
  
  // Extract options flow indicators
  const ivPercentile = nzPercent(x.ivPercentile);
  const callPutRatio = nzPositive(x.callPutRatio);
  
  // Extract sentiment
  const sentimentScore = x.sentiment !== undefined ? Math.max(-1, Math.min(1, nz(x.sentiment))) : null;
  
  // Generate reasons from available data
  const reasons = [];
  
  if (shortInterestPct && shortInterestPct > 20) {
    reasons.push(`High short interest: ${Math.round(shortInterestPct)}%`);
  }
  if (borrowFeePct && borrowFeePct > 5) {
    reasons.push(`High borrow fee: ${Math.round(borrowFeePct)}%`);
  }
  if (utilizationPct && utilizationPct > 80) {
    reasons.push(`High utilization: ${Math.round(utilizationPct)}%`);
  }
  if (relVol && relVol > 2.0) {
    reasons.push(`Volume spike: ${relVol.toFixed(1)}x average`);
  }
  if (ivPercentile && ivPercentile > 80) {
    reasons.push(`High IV: ${Math.round(ivPercentile)}th percentile`);
  }
  if (callPutRatio && callPutRatio > 2.0) {
    reasons.push(`Bullish options flow: ${callPutRatio.toFixed(1)} C/P ratio`);
  }
  if (x.buzz && x.buzz > 1.5) {
    reasons.push(`Social buzz: ${x.buzz.toFixed(1)}x average`);
  }
  if (sentimentScore && sentimentScore > 0.6) {
    reasons.push("Positive sentiment");
  }
  if (score >= 85) {
    reasons.push("High composite score");
  }
  
  // Determine catalyst from enrichment data
  let catalyst = null;
  if (x.buzz && x.buzz > 2.0) {
    catalyst = "Social media buzz";
  } else if (shortInterestPct && shortInterestPct > 30 && borrowFeePct && borrowFeePct > 10) {
    catalyst = "Short squeeze setup";
  } else if (callPutRatio && callPutRatio > 3.0) {
    catalyst = "Options gamma squeeze";
  } else if (ivPercentile && ivPercentile > 90) {
    catalyst = "High implied volatility";
  }
  
  // Build metadata
  const excludeKeys = [
    'ticker', 'symbol', 'score', 'price', 'confidence', 'relVol',
    'shortInterest', 'utilization', 'borrowFee', 'callPutRatio', 
    'ivPercentile', 'sentiment', 'buzz'
  ];
  
  let meta = extractMeta(x, excludeKeys);
  
  // Parse existing meta if string
  if (typeof x.meta === "string") {
    try {
      const parsed = JSON.parse(x.meta);
      meta = { ...meta, ...parsed };
    } catch (e) {
      meta.raw_meta = x.meta;
    }
  } else if (typeof x.meta === "object" && x.meta !== null) {
    meta = { ...meta, ...x.meta };
  }
  
  // Add enrichment telemetry
  if (x.enrichErrors && x.enrichErrors.length > 0) {
    meta.enrichment_errors = x.enrichErrors.slice(0, 5); // Limit error storage
  }
  
  // Add source tracking
  meta.source = "alphastack";
  meta.enriched = confidence === "high";
  meta.adapted_at = new Date().toISOString();
  
  return {
    ticker,
    score,
    price,
    confidence,
    relVol,
    atrPct,
    rsi,
    vwapDistPct,
    shortInterestPct,
    borrowFeePct,
    utilizationPct,
    ivPercentile,
    callPutRatio,
    catalyst: safeString(catalyst),
    sentimentScore,
    reasons,
    meta
  };
}

function adaptAlphaStackBatch(items) {
  const valid = [];
  const invalid = [];
  
  for (const item of items) {
    try {
      const adapted = adaptAlphaStackItem(item);
      const validation = safeValidateDiscovery(adapted);
      
      if (validation.success) {
        valid.push(validation.data);
      } else {
        invalid.push({ item, error: validation.error });
      }
    } catch (error) {
      invalid.push({ 
        item, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  return { valid, invalid };
}

module.exports = {
  adaptAlphaStackItem,
  adaptAlphaStackBatch
};