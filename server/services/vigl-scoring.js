/**
 * VIGL Scoring Engine - Pure Deterministic Scoring (0-4 scale)
 * Implements the proven 324% winner pattern detection methodology
 */

const { DISCOVERY } = require('../../config/discovery');

/**
 * Calculate VIGL score for an enriched stock candidate
 * @param {Object} candidate Enriched candidate data
 * @returns {Object} Score result with components and classification
 */
function viglScore(candidate) {
  const { normalizePrice } = require('../../lib/price');
  
  if (!candidate) {
    console.warn('⚠️ [vigl_score] Invalid candidate: null/undefined');
    return { score: 0, action: 'DROP', symbol: 'UNKNOWN', price: 0 };
  }
  
  // Handle both 'symbol' and 'ticker' fields
  const symbol = candidate.symbol || candidate.ticker || 'UNKNOWN';
  
  // Extract and validate price
  let price = normalizePrice(candidate);
  if (!price || price <= 0) {
    // Try nested data structure
    price = normalizePrice(candidate.data) || normalizePrice(candidate.quote);
    
    if (!price || price <= 0) {
      console.warn(`⚠️ [vigl_score] ${symbol}: no valid price found, score=0`);
      return { 
        score: 0, 
        action: 'DROP', 
        symbol, 
        price: 0,
        components: { volume: 0, squeeze: 0, catalyst: 0, sentiment: 0, options: 0, technical: 0 }
      };
    }
  }
  
  const { rvol = 1.0, shortData = {}, options = {}, social = {}, news = {}, technicals = {} } = candidate;
  const weights = DISCOVERY.weights;
  
  console.log(`🧮 Computing VIGL score for ${symbol} (price: $${price})`);
  
  // Use real VIGL scoring
  const { scoreStock } = require('../scoring/vigl');
  const result = await scoreStock(symbol);
  
  function logComponents(result) {
    const { components, composite, reasons } = result;
    console.log(`   Components: Vol(${components.volume}), Squeeze(${components.squeeze}), Catalyst(${components.catalyst}), Sentiment(${components.sentiment}), Options(${components.options}), Technical(${components.technical}) => ${composite}`);
    if (reasons.length > 0) console.log(`   Reasons: ${reasons.join(', ')}`);
  }
  
  function saveScore(symbol, composite, components, reasons) {
    // Store the scoring result - convert to legacy format for compatibility
    const legacyComponents = {
      volume: components.volume / 100,        // convert 0-100 to 0-1
      squeeze: components.squeeze / 100,
      catalyst: components.catalyst / 100,
      sentiment: components.sentiment / 100,
      options: components.options / 100,
      technical: components.technical / 100
    };
    return { components: legacyComponents, composite: composite / 100 };
  }
  
  logComponents(result);
  const legacyResult = saveScore(result.symbol, result.composite, result.components, result.reasons);
  const components = legacyResult.components;
  
  // Use the composite score from the real VIGL scoring (already weighted)
  let compositeScore = legacyResult.composite;
  
  // Guard against NaN
  if (!Number.isFinite(compositeScore)) {
    console.warn(`⚠️ [score_nan] ${symbol}: composite score is NaN, components:`, components);
    compositeScore = 0;
  }
  
  // Scale to 0-100 range for AlphaStack compatibility (not 0-4)
  const viglScore = Math.min(100, Math.max(0, +(compositeScore * 100).toFixed(1)));
  
  // Classify based on thresholds
  let action = 'DROP';
  if (viglScore >= DISCOVERY.classify.buy) {
    action = 'BUY';
  } else if (viglScore >= DISCOVERY.classify.watch) {
    action = 'WATCHLIST';
  } else if (viglScore >= DISCOVERY.classify.monitor) {
    action = 'MONITOR';
  }
  
  console.log(`📊 ${symbol} VIGL Score: ${viglScore} → ${action}`);;
  console.log(`📊 Components: Vol(${components.volume.toFixed(2)}) Squeeze(${components.squeeze.toFixed(2)}) Catalyst(${components.catalyst.toFixed(2)}) Sentiment(${components.sentiment.toFixed(2)}) Options(${components.options.toFixed(2)}) Tech(${components.technical.toFixed(2)})`);
  
  return {
    symbol,
    price,
    rvol,
    score: viglScore,
    action,
    components,
    scoredAt: new Date().toISOString()
  };
}

/**
 * Score volume component (0-1)
 * Higher relative volume = higher explosive potential
 */
function scoreVolume(rvol) {
  // Normalize RVOL: 1.5x = 0.2, 6x+ = 1.0
  return normalize(rvol, 1.5, 6.0);
}

/**
 * Score short squeeze potential (0-1)  
 * High short interest + high utilization + high borrow fee = squeeze setup
 */
function scoreSqueeze(shortData) {
  const { shortInterest = 0, utilization = 0, borrowFee = 0, daysToCover = 0, floatM = 999 } = shortData;
  
  // Individual squeeze factors
  const siScore = normalize(shortInterest, 0.15, 0.50);     // 15-50% short interest
  const utilScore = normalize(utilization, 0.70, 0.95);      // 70-95% utilization  
  const feeScore = normalize(borrowFee, 0.05, 0.50);         // 5-50% borrow fee
  const dtcScore = clamp(daysToCover / 10, 0, 1);            // Days to cover factor
  const floatScore = 1 - normalize(floatM, 10, 100);         // Smaller float = higher score
  
  // Composite squeeze score
  const squeezeScore = average([siScore, utilScore, feeScore, dtcScore, floatScore]);
  
  return clamp(squeezeScore, 0, 1);
}

/**
 * Score catalyst potential (0-1)
 * Verified catalysts provide explosive potential
 */
function scoreCatalyst(news) {
  const { hasCatalyst = false, catalystType = 'none', newsCount = 0, sentiment = 0.5 } = news;
  
  if (hasCatalyst) {
    // Verified catalyst gets high score
    const typeMultiplier = getCatalystMultiplier(catalystType);
    return Math.min(0.8 * typeMultiplier + 0.2 * sentiment, 1.0);
  }
  
  // No verified catalyst - score based on news activity and sentiment
  const newsActivity = normalize(newsCount, 3, 15);
  const sentimentBoost = normalize(sentiment, 0.6, 0.9);
  
  return Math.min(0.3 + 0.4 * newsActivity + 0.3 * sentimentBoost, 0.7); // Cap at 0.7 without verified catalyst
}

/**
 * Score social sentiment (0-1)
 * Social buzz and positive sentiment indicate momentum
 */
function scoreSentiment(social) {
  const { buzz = 1.0, sentiment = 0.5, zScore = 0 } = social;
  
  const buzzScore = normalize(buzz, 1.2, 3.0);              // 1.2x to 3x normal buzz
  const sentimentScore = normalize(sentiment, 0.6, 0.85);   // 60-85% positive sentiment
  const zScoreBonus = normalize(zScore, 1.5, 3.0);          // Statistical significance
  
  return average([buzzScore, sentimentScore, zScoreBonus]);
}

/**
 * Score options activity (0-1) 
 * Call activity and high IV can indicate explosive moves
 */
function scoreOptions(options) {
  const { callPutRatio = 1.0, ivPercentile = 50, nearMoneyOI = 0 } = options;
  
  const callBias = normalize(callPutRatio, 1.2, 2.5);       // Call bias 1.2x to 2.5x
  const ivScore = normalize(ivPercentile, 70, 95);          // High IV percentile  
  const oiScore = normalize(nearMoneyOI, 10000, 100000);    // Open interest activity
  
  return average([callBias, ivScore, oiScore]);
}

/**
 * Score technical setup (0-1)
 * Technical indicators supporting upward momentum
 */
function scoreTechnical(technicals, currentPrice) {
  const { rsi = 50, ema9 = 0, ema20 = 0, vwap = 0, aboveVWAP = false, emaUptrend = false } = technicals;
  
  // RSI in momentum zone (not overbought/oversold)
  const rsiScore = rsi >= 55 && rsi <= 75 ? 1.0 : rsi >= 45 && rsi <= 80 ? 0.6 : 0.2;
  
  // EMA uptrend signal
  const emaScore = emaUptrend ? 1.0 : 0.0;
  
  // Price above VWAP (institutional support)
  const vwapScore = aboveVWAP ? 1.0 : 0.3;
  
  // Price vs EMA positioning
  const priceVsEMA = currentPrice > ema9 ? 1.0 : 0.2;
  
  return average([rsiScore, emaScore, vwapScore, priceVsEMA]);
}

/**
 * Get catalyst type multiplier
 */
function getCatalystMultiplier(catalystType) {
  const multipliers = {
    'fda': 1.0,        // FDA approval - highest explosive potential
    'earnings': 0.9,    // Earnings beat
    'merger': 0.95,     // M&A activity
    'partnership': 0.8, // Strategic partnerships  
    'product': 0.7,     // Product launches
    'upgrade': 0.6,     // Analyst upgrades
    'none': 0.3         // No specific catalyst
  };
  return multipliers[catalystType] || 0.3;
}

// Utility functions
function normalize(value, min, max) {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
  return validValues.length > 0 ? validValues.reduce((a, b) => a + b, 0) / validValues.length : 0;
}

module.exports = {
  viglScore,
  scoreVolume,
  scoreSqueeze,
  scoreCatalyst,
  scoreSentiment,
  scoreOptions,
  scoreTechnical
};