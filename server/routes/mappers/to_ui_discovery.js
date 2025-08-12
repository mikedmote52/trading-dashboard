// Safe, uniform mapper that never throws NaN or crashes on missing data
// Converts any discovery object (database row or engine output) to consistent UI format

const { safeNum, formatPrice, formatPercent } = require('../../services/squeeze/metrics_safety');

function toUiDiscovery(rawData) {
  // Handle both database rows and direct discovery objects
  const data = rawData.features_json ? 
    safeParseJSON(rawData.features_json, rawData) : rawData;
  
  // Skip completely invalid entries
  if (!data || (!data.ticker && !data.symbol)) {
    return null;
  }
  
  const ticker = data.ticker || data.symbol || rawData.symbol;
  const price = safeNum(data.price || rawData.price, 0);
  
  // Skip entries with invalid price
  if (price <= 0) {
    return null;
  }
  
  return {
    ticker,
    name: data.name || data.company || ticker,
    price,
    changePct: safeNum(data.changePct || data.price_change_1d_pct || data.momentum, null),
    
    // Volume metrics
    volumeX: safeNum(data.volumeX || data.relVol || data.intraday_rel_volume || 
                    data.technicals?.rel_volume, 1),
    volumeToday: safeNum(data.volumeToday || data.technicals?.volume, null),
    
    // Core scoring
    score: safeNum(data.score || data.composite_score || rawData.score, 0),
    action: data.action || rawData.action || 
            (safeNum(data.score || rawData.score, 0) >= 75 ? 'BUY' : 
             safeNum(data.score || rawData.score, 0) >= 60 ? 'WATCHLIST' : 'MONITOR'),
    
    // Short squeeze metrics
    shortInterest: safeNum(data.shortInterest || data.short_interest_pct, null),
    shortInterestMethod: data.shortInterestMethod || data.short_interest_method || 'unknown',
    shortInterestConfidence: safeNum(data.shortInterestConfidence || data.short_interest_confidence, 1.0),
    daysToCover: safeNum(data.daysToCover || data.days_to_cover, null),
    borrowFee: safeNum(data.borrowFee || data.borrow_fee_pct, null),
    utilization: safeNum(data.utilization || data.utilization_pct, null),
    
    // Float and liquidity
    floatShares: safeNum(data.floatShares || data.float_shares, null),
    liquidity: safeNum(data.liquidity || data.avg_dollar_liquidity_30d, null),
    
    // Options flow
    options: {
      callPutRatio: safeNum(data.options?.callPut || data.options?.callPutRatio || 
                           data.options?.call_put_ratio, null),
      ivPercentile: safeNum(data.options?.ivPercentile || data.options?.iv_percentile, null),
      gammaExposure: safeNum(data.options?.gamma || data.options?.gammaExposure || 
                            data.options?.gamma_exposure, null)
    },
    
    // Technical indicators
    technicals: {
      vwap: safeNum(data.technicals?.vwap, null),
      ema9: safeNum(data.technicals?.ema9, null),
      ema20: safeNum(data.technicals?.ema20, null),
      rsi: safeNum(data.technicals?.rsi, null),
      atrPct: safeNum(data.technicals?.atr_pct || data.technicals?.atrPct, null),
      relVolume: safeNum(data.technicals?.rel_volume, null)
    },
    
    // Catalyst information
    catalyst: data.catalyst ? {
      type: data.catalyst.type || 'unknown',
      description: data.catalyst.description || data.catalyst.title || '',
      confidence: safeNum(data.catalyst.confidence, 0.5),
      verified: !!data.catalyst.verified_in_window
    } : null,
    
    // Sentiment
    sentiment: {
      score: safeNum(data.sentiment?.score, null),
      sources: Array.isArray(data.sentiment?.sources) ? data.sentiment.sources : []
    },
    
    // Entry and risk management
    entryHint: data.entry_hint || data.entryHint ? {
      type: (data.entry_hint || data.entryHint).type || 'breakout',
      triggerPrice: safeNum((data.entry_hint || data.entryHint).trigger_price || 
                           (data.entry_hint || data.entryHint).triggerPrice, price)
    } : null,
    
    risk: data.risk ? {
      stopLoss: safeNum(data.risk.stop_loss || data.risk.stopLoss, price * 0.9),
      takeProfit1: safeNum(data.risk.tp1 || data.risk.takeProfit1, price * 1.2),
      takeProfit2: safeNum(data.risk.tp2 || data.risk.takeProfit2, price * 1.5)
    } : null,
    
    // Metadata
    discoveredAt: data.discoveredAt || data.created_at || rawData.created_at || 
                  new Date().toISOString(),
    discoveryMethod: data.discovery_method || data.discoveryMethod || 'legacy',
    estimatedData: !!data.estimated_data || !!data.estimatedData,
    
    // Data quality indicators
    dataQuality: {
      hasTechnicals: !!(data.technicals?.price),
      hasShortData: !!(data.shortInterest || data.short_interest_pct),
      hasOptions: !!(data.options?.callPutRatio || data.options?.callPut),
      hasCatalyst: !!(data.catalyst?.type),
      isEstimated: !!data.estimated_data || !!data.estimatedData
    },
    
    // Backwards compatibility fields
    currentPrice: price,
    similarity: Math.min(safeNum(data.score || rawData.score, 0) / 100, 1.0),
    confidence: Math.min(safeNum(data.score_confidence || data.scoreConfidence, 1.0), 1.0),
    viglScore: Math.min(safeNum(data.score || rawData.score, 0) / 100, 1.0),
    recommendation: data.action || rawData.action || 'MONITOR',
    isHighConfidence: safeNum(data.score || rawData.score, 0) >= 75,
    
    // Timestamp
    ts: data.ts || Date.now()
  };
}

function safeParseJSON(jsonString, fallback = {}) {
  if (!jsonString || jsonString === 'undefined' || jsonString === 'null') {
    return fallback;
  }
  
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

// Batch mapping with error isolation
function mapDiscoveries(rawDiscoveries) {
  if (!Array.isArray(rawDiscoveries)) {
    return [];
  }
  
  return rawDiscoveries
    .map(raw => {
      try {
        return toUiDiscovery(raw);
      } catch (error) {
        console.warn(`⚠️ Failed to map discovery ${raw?.symbol || raw?.ticker || 'unknown'}:`, error.message);
        return null;
      }
    })
    .filter(d => d !== null);
}

module.exports = {
  toUiDiscovery,
  mapDiscoveries,
  safeParseJSON
};