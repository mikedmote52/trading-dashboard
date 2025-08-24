/**
 * Provider interfaces for enrichment data sources
 * Currently using cached fallback implementations
 * TODO: Wire real APIs for momentum, squeeze, options, sentiment data
 */

/**
 * @typedef {Object} Momentum
 * @property {number} relVol - Relative volume (1.0 = average)
 * @property {number} atrPct - ATR as percentage of price
 * @property {number} rsi - RSI value (0-100)
 * @property {number} vwapDist - Distance from VWAP as percentage
 */

/**
 * @typedef {Object} Squeeze  
 * @property {number|null} floatM - Float in millions
 * @property {number|null} shortPct - Short interest percentage
 * @property {number|null} borrowFee - Borrow fee percentage
 * @property {number|null} util - Utilization percentage
 * @property {number|null} dtc - Days to cover
 */

/**
 * @typedef {Object} Options
 * @property {number|null} callPutRatio - Call/Put volume ratio
 * @property {number|null} nearMoneyCallOI - Near-money call open interest
 * @property {number|null} ivPctile - IV percentile (0-100)
 * @property {number|null} gammaExposure - Gamma exposure estimate
 */

/**
 * @typedef {Object} Sentiment
 * @property {number} reddit - Reddit mentions count
 * @property {number} stocktwits - StockTwits mentions count
 * @property {number} youtube - YouTube mentions count
 * @property {number|null} score - Composite sentiment score (0-1)
 * @property {boolean} topBuzz - Whether symbol is trending
 */

/**
 * @typedef {Object} Technical
 * @property {boolean} ema9_gt_ema20 - Whether EMA9 > EMA20
 * @property {number|null} ema9 - 9-period EMA
 * @property {number|null} ema20 - 20-period EMA
 * @property {boolean} holdingVWAP - Whether price is holding above VWAP
 */

/**
 * @typedef {Object} Enrichment
 * @property {Momentum} momentum
 * @property {Squeeze} squeeze
 * @property {Options} options
 * @property {Sentiment} sentiment
 * @property {Technical} technical
 */

/**
 * @typedef {Object} ProviderCtx
 * @property {string} symbol
 * @property {Date} now
 */

/**
 * Momentum provider - TODO: wire real intraday bars
 * @param {ProviderCtx} ctx
 * @returns {Promise<Momentum>}
 */
async function momentumProvider(ctx) {
  // TODO: Replace with real market data calls
  // For now, using symbol-based deterministic fallback
  const hash = ctx.symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  
  return {
    relVol: 1 + (hash % 4), // 1-4x volume
    atrPct: 0.02 + (hash % 6) * 0.01, // 2-7% ATR
    rsi: 40 + (hash % 40), // 40-80 RSI
    vwapDist: -2 + (hash % 4) // -2% to +2% from VWAP
  };
}

/**
 * Squeeze provider - TODO: wire short interest APIs
 * @param {ProviderCtx} ctx
 * @returns {Promise<Squeeze>}
 */
async function squeezeProvider(ctx) {
  // TODO: Replace with real short interest data
  return {
    floatM: null,
    shortPct: null,
    borrowFee: null,
    util: null,
    dtc: null
  };
}

/**
 * Options provider - TODO: wire options flow data
 * @param {ProviderCtx} ctx
 * @returns {Promise<Options>}
 */
async function optionsProvider(ctx) {
  // TODO: Replace with real options data
  return {
    callPutRatio: null,
    nearMoneyCallOI: null,
    ivPctile: null,
    gammaExposure: null
  };
}

/**
 * Sentiment provider - TODO: wire social media APIs
 * @param {ProviderCtx} ctx
 * @returns {Promise<Sentiment>}
 */
async function sentimentProvider(ctx) {
  // TODO: Replace with real sentiment data
  return {
    reddit: 0,
    stocktwits: 0,
    youtube: 0,
    score: null,
    topBuzz: false
  };
}

/**
 * Technical provider - TODO: wire TA indicators
 * @param {ProviderCtx} ctx
 * @returns {Promise<Technical>}
 */
async function technicalProvider(ctx) {
  // TODO: Replace with real technical analysis
  const hash = ctx.symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  
  return {
    ema9_gt_ema20: hash % 2 === 0, // 50% chance bullish
    ema9: null,
    ema20: null,
    holdingVWAP: hash % 3 === 0 // 33% chance holding VWAP
  };
}

module.exports = {
  momentumProvider,
  squeezeProvider, 
  optionsProvider,
  sentimentProvider,
  technicalProvider
};