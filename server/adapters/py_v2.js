/**
 * Python Screener V2 → DiscoveryV1 Adapter
 * 
 * Normalizes Python universe_screener_v2.py output into canonical DiscoveryV1 schema
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

function adaptPyItem(x) {
  const indicators = x.indicators || {};
  
  // Extract core fields
  const ticker = extractTicker(x);
  const score = normalizeScore(x.score, 60);
  const price = nzPositive(x.price);
  
  // Determine confidence based on enrichment quality
  const hasRichIndicators = indicators.relvol !== undefined || indicators.atr_pct !== undefined;
  const confidence = toConfidence(hasRichIndicators);
  
  // Extract market microstructure
  const relVol = nzPositive(indicators.relvol || x.rel_vol_30m);
  const atrPct = nzPositive(indicators.atr_pct);
  const rsi = nzPercent(indicators.rsi);
  const vwapDistPct = indicators.vwap_dist_pct ? nz(indicators.vwap_dist_pct) : null;
  
  // Generate reasons from available data
  const reasons = [];
  if (indicators.ret_5d && indicators.ret_5d > 20) {
    reasons.push(`Strong 5d momentum: +${Math.round(indicators.ret_5d)}%`);
  }
  if (atrPct && atrPct > 8) {
    reasons.push(`High volatility: ${Math.round(atrPct)}% ATR`);
  }
  if (relVol && relVol > 1.5) {
    reasons.push(`Volume spike: ${relVol.toFixed(1)}x average`);
  }
  if (score >= 95) {
    reasons.push("Top-tier score");
  }
  
  // Extract catalyst from thesis
  const thesis = x.thesis || x.thesis_tldr || "";
  const catalyst = thesis.includes("earnings") ? "Earnings" :
                  thesis.includes("breakout") ? "Technical breakout" :
                  thesis.includes("momentum") ? "Price momentum" : null;
  
  // Build metadata
  const excludeKeys = ['ticker', 'symbol', 'price', 'score', 'action', 'thesis', 'thesis_tldr', 'rel_vol_30m', 'indicators'];
  const meta = extractMeta(x, excludeKeys);
  
  // Add thesis to meta for UI display
  if (thesis) {
    meta.thesis = thesis;
  }
  
  // Add targets to meta
  if (x.targets) {
    meta.targets = x.targets;
  }
  
  // Add source tracking
  meta.source = "python_screener_v2";
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
    shortInterestPct: null, // Not provided by Python screener
    borrowFeePct: null,
    utilizationPct: null,
    ivPercentile: null,
    callPutRatio: null,
    catalyst: safeString(catalyst),
    sentimentScore: null,
    reasons,
    meta
  };
}

function adaptPyScreenerOutput(items) {
  const valid = [];
  const invalid = [];
  
  for (const item of items) {
    try {
      const adapted = adaptPyItem(item);
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
  adaptPyItem,
  adaptPyScreenerOutput
};