/**
 * AlphaStack → DiscoveryV1 Adapter
 * 
 * Normalizes AlphaStack enriched discovery items into canonical DiscoveryV1 schema
 */

import { DiscoveryV1, safeValidateDiscovery } from "../schemas/discovery";
import { 
  extractTicker, 
  normalizeScore, 
  nzPositive, 
  nz, 
  nzPercent,
  toConfidence, 
  safeString, 
  safeStringArray,
  extractMeta 
} from "../schemas/adapter";

export interface AlphaStackItem {
  ticker: string;
  symbol?: string;
  score: number;
  price?: number;
  confidence?: string | boolean;
  relVol?: number;
  // Enriched data from providers
  shortInterest?: number;
  utilization?: number;
  borrowFee?: number;
  daysToCover?: number;
  floatM?: number;
  callPutRatio?: number;
  ivPercentile?: number;
  nearMoneyOI?: number;
  gammaExposure?: number;
  buzz?: number;
  sentiment?: number;
  mentions?: number;
  zScore?: number;
  // Quote data
  change?: number;
  volume?: number;
  // Raw enrichment data
  enrichErrors?: any[];
  prefiltered?: boolean;
  meta?: string | object;
  [key: string]: any;
}

export function adaptAlphaStackItem(x: AlphaStackItem): DiscoveryV1 {
  // Extract core fields
  const ticker = extractTicker(x);
  const score = normalizeScore(x.score, 60);
  const price = nzPositive(x.price);
  
  // Determine confidence based on enrichment success
  let confidence: "low" | "high" = "low";
  if (typeof x.confidence === "string") {
    confidence = x.confidence === "high" ? "high" : "low";
  } else if (typeof x.confidence === "boolean") {
    confidence = x.confidence ? "high" : "low";
  } else {
    // Infer confidence from data richness
    const hasRichData = x.relVol !== undefined || x.shortInterest !== undefined || x.ivPercentile !== undefined;
    const hasMinimalErrors = (!x.enrichErrors || x.enrichErrors.length < 2);
    confidence = hasRichData && hasMinimalErrors ? "high" : "low";
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
  const reasons: string[] = [];
  
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
  let catalyst: string | null = null;
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

export function adaptAlphaStackBatch(items: AlphaStackItem[]): { 
  valid: DiscoveryV1[]; 
  invalid: Array<{ item: AlphaStackItem; error: string }> 
} {
  const valid: DiscoveryV1[] = [];
  const invalid: Array<{ item: AlphaStackItem; error: string }> = [];
  
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