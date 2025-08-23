/**
 * Python Screener V2 → DiscoveryV1 Adapter
 * 
 * Normalizes Python universe_screener_v2.py output into canonical DiscoveryV1 schema
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

export interface PyScreenerItem {
  ticker: string;
  symbol?: string;
  price: number;
  score: number;
  action?: string;
  thesis?: string;
  thesis_tldr?: string;
  rel_vol_30m?: number;
  indicators?: {
    relvol?: number;
    ret_5d?: number;
    ret_21d?: number;
    atr_pct?: number;
    avg_dollar?: number;
    rsi?: number;
    vwap_dist_pct?: number;
  };
  targets?: {
    entry?: string;
    tp1?: string;
    tp2?: string;
    stop?: string;
  };
  timestamp?: number;
  [key: string]: any;
}

export function adaptPyItem(x: PyScreenerItem): DiscoveryV1 {
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
  const reasons: string[] = [];
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

export function adaptPyScreenerOutput(items: PyScreenerItem[]): { 
  valid: DiscoveryV1[]; 
  invalid: Array<{ item: PyScreenerItem; error: string }> 
} {
  const valid: DiscoveryV1[] = [];
  const invalid: Array<{ item: PyScreenerItem; error: string }> = [];
  
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