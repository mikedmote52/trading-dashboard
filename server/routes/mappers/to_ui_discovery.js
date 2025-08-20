// Safe, uniform mapper that never throws NaN or crashes on missing data
// Converts any discovery object (database row or engine output) to consistent UI format

const { safeNum, formatPrice, formatPercent } = require('../../services/squeeze/metrics_safety');
const { deriveAlphaThesis } = require('../../lib/thesis');

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
  
  // Determine action based on readiness tier
  const readinessTier = data.readiness_tier || rawData.readiness_tier || 'WATCH';
  let action = data.action || rawData.action;
  
  // Map readiness tiers to UI actions
  if (readinessTier === 'TRADE_READY') {
    action = 'BUY'; // Show Buy button with $100 default
  } else if (readinessTier === 'EARLY_READY') {
    action = 'BUY_EARLY'; // Show Buy button with $50 default
  } else if (readinessTier === 'WATCH' || action === 'WATCHLIST') {
    action = 'WATCHLIST';
  } else {
    action = 'MONITOR';
  }
  
  return {
    ticker,
    name: data.name || data.company || ticker,
    price,
    changePct: safeNum(data.changePct || data.price_change_1d_pct || data.momentum, null),
    
    // Volume metrics
    volumeX: safeNum(data.volumeX || data.relVol || data.relVolume || data.intraday_rel_volume || 
                    data.technicals?.rel_volume, 1),
    volumeToday: safeNum(data.volumeToday || data.technicals?.volume, null),
    
    // Core scoring
    score: safeNum(data.score || data.composite_score || rawData.score, 0),
    action: action,
    
    // Readiness tier and flags
    readiness_tier: readinessTier,
    high_priority: data.high_priority || ((data.volumeX || data.relVolume || 1) >= 3.0),
    relaxationActive: data.relaxationActive || false,
    score_breakdown: data.score_breakdown || {},
    bumps: data.bumps || {},
    
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
    
    // Generate comprehensive thesis using existing thesis engine
    thesis: generateComprehensiveThesis(data, rawData, ticker, price),
    
    // Target prices for UI display
    targetPrices: {
      tp1: price * 1.15, // 15% target
      tp2: price * 1.30, // 30% target
      conservative: price * 1.10,
      aggressive: price * 1.50
    },
    
    // Timestamp
    ts: data.ts || Date.now()
  };
}

// Generate comprehensive thesis paragraph for thesis-first UI
function generateComprehensiveThesis(data, rawData, ticker, price) {
  try {
    // Use existing deriveAlphaThesis function
    const { thesis, reasons } = deriveAlphaThesis({ ...data, ticker, price });
    
    // If we have detailed reasons, create a rich thesis paragraph
    if (reasons && reasons.length > 0) {
      const keyPoints = reasons.map(r => r.value).join('. ');
      return `${thesis}. ${keyPoints}`;
    }
    
    // Fallback to basic thesis with available data
    const score = safeNum(data.score || rawData.score, 50);
    const rvol = safeNum(data.volumeX || data.relVol || data.technicals?.rel_volume, 1);
    const action = data.action || rawData.action || 'MONITOR';
    const changePct = safeNum(data.changePct || data.price_change_1d_pct, 0);
    
    // Build thesis components
    const components = [];
    
    // Price action
    if (changePct > 0) {
      components.push(`+${changePct.toFixed(1)}% momentum`);
    }
    
    // Volume analysis
    if (rvol >= 2.0) {
      components.push(`${rvol.toFixed(1)}× volume surge indicating institutional interest`);
    } else if (rvol >= 1.5) {
      components.push(`${rvol.toFixed(1)}× above-average volume supporting move`);
    }
    
    // Technical setup
    const technicals = data.technicals || {};
    if (technicals.rsi && technicals.rsi > 50) {
      components.push(`RSI ${technicals.rsi.toFixed(0)} showing bullish momentum`);
    }
    
    // Short interest opportunity
    const shortPct = safeNum(data.shortInterest || data.short_interest_pct, 0);
    const borrowFee = safeNum(data.borrowFee || data.borrow_fee_pct, 0);
    if (shortPct > 10 || borrowFee > 5) {
      components.push(`${shortPct}% SI with ${borrowFee}% borrow fee creating squeeze potential`);
    }
    
    // VWAP positioning
    if (technicals.vwap && price > technicals.vwap) {
      components.push(`trading above VWAP resistance at $${technicals.vwap.toFixed(2)}`);
    }
    
    // Options flow
    const cpr = safeNum(data.options?.callPutRatio || data.options?.callPut, 0);
    if (cpr > 1.5) {
      components.push(`${cpr.toFixed(1)}:1 call/put ratio showing bullish sentiment`);
    }
    
    // Catalyst enhancement
    const catalyst = data.catalyst;
    if (catalyst && catalyst.description) {
      components.push(`recent catalyst: ${catalyst.description}`);
    }
    
    // Risk/reward context
    const tp1 = price * 1.15;
    const stop = price * 0.90;
    const rrRatio = ((tp1 - price) / (price - stop)).toFixed(1);
    components.push(`R/R ${rrRatio}:1 to $${tp1.toFixed(2)} target`);
    
    // Action context
    let actionContext = '';
    if (action === 'BUY') {
      actionContext = 'Strong setup warrants immediate entry.';
    } else if (action === 'WATCHLIST') {
      actionContext = 'Monitor for confirmation signals before entry.';
    } else {
      actionContext = 'Technical setup developing - watch for breakout.';
    }
    
    // Combine into coherent thesis
    const thesisBody = components.length > 0 ? 
      components.slice(0, 3).join(', ') + '.' : 
      `Score ${score} setup developing with technical confirmation pending.`;
    
    return `${ticker} ${actionContext} ${thesisBody}`;
    
  } catch (error) {
    console.warn(`⚠️ Thesis generation failed for ${ticker}:`, error.message);
    
    // Ultra-safe fallback
    const score = safeNum(data.score || rawData.score, 50);
    const action = data.action || rawData.action || 'MONITOR';
    return `${ticker} ${action.toLowerCase()} setup with ${score} composite score. Technical analysis suggests ${action === 'BUY' ? 'favorable' : 'developing'} risk/reward profile.`;
  }
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