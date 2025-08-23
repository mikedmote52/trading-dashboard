/**
 * Finalist Enrichment Service - Expensive Rate-Limited Feature Fetching
 * Only called for top 10-20 candidates that passed prefiltering
 */

// Environment-based configuration
const CONFIG = {
  concurrency: Number(process.env.ENRICH_CONCURRENCY ?? 4),
  timeoutMs: Number(process.env.ENRICH_TIMEOUT_MS ?? 4000),
  cycleBudgetMs: Number(process.env.ENRICH_CYCLE_BUDGET_MS ?? 12000),
  retries: Number(process.env.ENRICH_MAX_RETRIES ?? 2)
};

// Structured telemetry
let lastEnrichCounters = {};
let lastEnrichTs = null;

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Import timeout-safe helpers
const { safeProvider, pTimeout } = require('../../lib/pTimeout');
const pLimit = require('p-limit');

async function safeCall(fn, maxRetries = CONFIG.retries) {
  let attempt = 0, backoff = 300;
  for (;;) {
    try { return await fn(); }
    catch (e) {
      const code = e?.response?.status || e?.code;
      const retriable = code === 429 || (code >= 500 && code < 600);
      if (!retriable || attempt >= maxRetries) throw e;
      await new Promise(r => setTimeout(r, backoff + Math.floor(Math.random() * 150)));
      backoff *= 2; attempt++;
    }
  }
}

/**
 * Enrich finalist candidates with comprehensive feature data
 * Uses rate limiting and concurrency control for expensive API calls
 * @param {Array<string>} symbols Array of finalist symbols to enrich
 * @returns {Promise<Array>} Enriched candidate data
 */
/**
 * Bounded enrichment batch with cycle budget management
 * @param {Array<string>} symbols Symbols to enrich
 * @returns {Promise<Array>} Enriched results within budget
 */
async function enrichBatch(symbols) {
  const startTime = Date.now();
  const limit = pLimit(CONFIG.concurrency);
  const results = [];
  
  console.log(`⏱️ Enrichment batch: ${symbols.length} symbols, budget ${CONFIG.cycleBudgetMs}ms, concurrency ${CONFIG.concurrency}`);
  
  for (const ticker of symbols) {
    // Hard budget check - leave 300ms margin
    if (Date.now() - startTime > CONFIG.cycleBudgetMs - 300) {
      console.log(`⏱️ Budget exceeded at ${symbols.indexOf(ticker)}/${symbols.length}, stopping enrichment`);
      break;
    }
    
    const enrichPromise = limit(() => enrichOne(ticker));
    results.push(await enrichPromise);
  }
  
  return results;
}

async function enrichFinalists(symbols) {
  if (!symbols || symbols.length === 0) {
    console.log('⚠️ No symbols provided for enrichment');
    return [];
  }
  
  console.log(`🔬 Starting finalist enrichment for ${symbols.length} candidates`);
  console.log(`🔬 Candidates: ${symbols.join(', ')}`);
  
  const startTime = Date.now();
  const results = [];
  const counters = { ok: 0, timeout: 0, 401: 0, 403: 0, 429: 0, schema: 0, other: 0 };
  const failedSamples = [];
  
  // Use bounded enrichment batch
  const enrichResults = await enrichBatch(symbols);
  
  // Process results and build telemetry (including price validation)
  let priceValidationCounters = { missing_price: 0, valid_price: 0, price_samples: [] };
  
  for (const result of enrichResults) {
    if (result.ok) {
      counters.ok++;
      
      // Price validation telemetry
      const { normalizePrice } = require('../../lib/price');
      const price = normalizePrice(result.data);
      if (!price || price <= 0) {
        priceValidationCounters.missing_price++;
        if (priceValidationCounters.price_samples.length < 3) {
          priceValidationCounters.price_samples.push({
            ticker: result.ticker,
            price_fields: Object.keys(result.data).filter(k => k.toLowerCase().includes('price'))
          });
        }
      } else {
        priceValidationCounters.valid_price++;
      }
      
      results.push(result.data);
    } else {
      for (const err of (result.errors || [])) {
        const code = err.code;
        if (code === 401) counters['401']++;
        else if (code === 403) counters['403']++;
        else if (code === 429) counters['429']++;
        else if (code === 'ETIMEDOUT') counters.timeout++;
        else counters.other++;
      }
      if (!result.errors?.length) counters.schema++;
      
      if (failedSamples.length < 3) {
        failedSamples.push({ ticker: result.ticker, errors: result.errors });
      }
    }
  }
  
  // Store telemetry for debug endpoint
  lastEnrichCounters = counters;
  lastEnrichTs = new Date().toISOString();
  
  console.log(`[enrich] requested=${symbols.length} success=${counters.ok} fail=${symbols.length - counters.ok} reasons=${JSON.stringify(counters)} sampleFail=${JSON.stringify(failedSamples)}`);
  console.log(`[final_price_check] enriched=${counters.ok} missing_price=${priceValidationCounters.missing_price} valid_price=${priceValidationCounters.valid_price}`);
  
  if (priceValidationCounters.missing_price > 0) {
    console.warn(`[price_validation_issues] ${JSON.stringify(priceValidationCounters.price_samples)}`);
  }
  
  return results;
}

/**
 * Enrich a single symbol with comprehensive data
 * @param {string} symbol Stock symbol to enrich
 * @returns {Promise<Object|null>} Enriched data or null if failed
 */
async function enrichOne(ticker) {
  const { normalizePrice, ensureValidPrice } = require('../../lib/price');
  const started = Date.now();
  const errors = [];
  let payload = { ticker, symbol: ticker }; // Ensure ticker/symbol fields exist
  
  // Check cache first
  const cacheKey = `${ticker}:${new Date().toISOString().slice(0, 10)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    const cachedData = { ...cached.data, ticker, symbol: ticker };
    // Ensure cached data has valid price
    const price = ensureValidPrice(cachedData, ticker);
    if (price) cachedData.price = price;
    return { ticker, ok: true, data: cachedData, durationMs: Date.now() - started };
  }
  
  // Try multiple providers with safe timeout handling
  const providers = [
    { name: 'quote', fn: () => safeCall(() => getLatestQuote(ticker)) },
    { name: 'rvol', fn: () => safeCall(() => calculateRelativeVolume(ticker)) },
    { name: 'short', fn: () => safeCall(() => getShortInterestData(ticker)) },
    { name: 'options', fn: () => safeCall(() => getOptionsActivity(ticker)) }
  ];
  
  for (const provider of providers) {
    const result = await safeProvider(provider.fn, provider.name, CONFIG.timeoutMs);
    
    if (result.__err) {
      errors.push(result.__err);
    } else if (result && typeof result === 'object') {
      payload = { ...payload, ...result };
    }
  }
  
  // Normalize and ensure valid price
  const price = ensureValidPrice(payload, ticker);
  if (price) {
    payload.price = price;
  } else {
    // Try to get price from quote data if not already present
    const fallbackPrice = normalizePrice(payload);
    if (fallbackPrice && fallbackPrice > 0) {
      payload.price = fallbackPrice;
    }
  }
  
  // Ensure ticker and symbol fields are set
  payload.ticker = ticker;
  payload.symbol = ticker;
  
  // Strict schema check - require valid price > 0 for enrichment success
  const hasValidPrice = payload.price && payload.price > 0;
  
  if (hasValidPrice) {
    // Cache successful result
    cache.set(cacheKey, { data: payload, ts: Date.now() });
    return { ticker, ok: true, data: payload, durationMs: Date.now() - started };
  } else {
    // Log why enrichment failed
    console.warn(`⚠️ [enrich_fail] ${ticker}: no valid price (got: ${payload.price}), enrichment failed`);
    errors.push({ code: 'NO_PRICE', message: `No valid price data available (${payload.price})` });
    return { ticker, ok: false, errors, durationMs: Date.now() - started };
  }
}

/**
 * Get latest authoritative price quote
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Quote data with price and volume
 */
async function getLatestQuote(symbol) {
  try {
    // Try features service first (but handle gracefully if it fails)
    try {
      const { fetchFeaturesForSymbols } = require('./features');
      const results = await fetchFeaturesForSymbols([symbol], 0);
      if (results && results.length > 0 && !results[0].failed) {
        const features = results[0];
        const price = features.price || features.currentPrice || features.current_price;
        if (price && price > 0) {
          return {
            price: price,
            volume: features.volume || 0,
            change: features.changePercent || 0,
            ticker: symbol
          };
        }
      }
    } catch (featuresError) {
      // Features service failed, try direct polygon fallback
      const axios = require('axios');
      const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev`, {
        params: { apikey: process.env.POLYGON_API_KEY },
        timeout: 3000
      });
      
      if (response.data?.results?.[0]) {
        const bar = response.data.results[0];
        const price = bar.c;
        if (price && price > 0) {
          return {
            price: price,
            volume: bar.v || 0,
            change: ((bar.c - bar.o) / bar.o * 100) || 0,
            ticker: symbol
          };
        }
      }
    }
  } catch (error) {
    throw new Error(`Quote fetch failed: ${error.message}`);
  }
  
  throw new Error('No quote data available');
}

/**
 * Calculate relative volume from historical data
 * @param {string} symbol Stock symbol  
 * @returns {Promise<number>} Relative volume multiplier
 */
async function calculateRelativeVolume(symbol) {
  try {
    // Try to get real volume data from polygon or fallback to mock
    const axios = require('axios');
    const today = new Date().toISOString().slice(0, 10);
    const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${today}/${today}`, {
      params: { apikey: process.env.POLYGON_API_KEY },
      timeout: 2000
    });
    
    if (response.data?.results?.[0]?.v) {
      const currentVol = response.data.results[0].v;
      // For now, assume average volume is current * 0.7 (will improve with historical data)
      const avgVol = currentVol * 0.7;
      return { relVol: avgVol > 0 ? currentVol / avgVol : 1.0 };
    }
    
    return { relVol: 1.2 }; // Modest mock value
  } catch (error) {
    return { relVol: 1.0 };
  }
}

/**
 * Get short interest and borrow data
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Short interest data
 */
async function getShortInterestData(symbol) {
  // Placeholder - integrate with short interest provider
  try {
    return {
      shortInterest: 0.15,     // 15%
      utilization: 0.80,       // 80%
      borrowFee: 0.10,         // 10%
      daysToCover: 2.5,        // days
      floatM: 25               // 25M shares
    };
  } catch (error) {
    console.error(`Short data fetch failed for ${symbol}:`, error.message);
    return {};
  }
}

/**
 * Get options activity and IV data  
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Options activity data
 */
async function getOptionsActivity(symbol) {
  // Placeholder - integrate with options data provider
  try {
    return {
      callPutRatio: 1.2,       // Call/put ratio
      ivPercentile: 75,        // IV percentile
      nearMoneyOI: 50000,      // Near money open interest
      gammaExposure: 1000000   // Gamma exposure
    };
  } catch (error) {
    console.error(`Options data fetch failed for ${symbol}:`, error.message);
    return {};
  }
}

/**
 * Get social sentiment and buzz metrics
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Social sentiment data
 */
async function getSocialSentiment(symbol) {
  // Placeholder - integrate with social data provider  
  try {
    return {
      buzz: 1.5,               // Social buzz multiplier
      sentiment: 0.6,          // Sentiment score 0-1
      mentions: 250,           // Mention count
      zScore: 2.1              // Standard deviations above mean
    };
  } catch (error) {
    console.error(`Social data fetch failed for ${symbol}:`, error.message);
    return {};
  }
}

/**
 * Get catalyst news and events
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} News and catalyst data
 */
async function getCatalystNews(symbol) {
  // Placeholder - integrate with news API
  try {
    return {
      hasCatalyst: false,      // Has verified catalyst
      catalystType: 'none',    // earnings, fda, merger, etc
      catalystDate: null,      // Date of catalyst
      newsCount: 5,            // Recent news count
      sentiment: 0.5           // News sentiment
    };
  } catch (error) {
    console.error(`News data fetch failed for ${symbol}:`, error.message);
    return {};
  }
}

/**
 * Get technical indicators
 * @param {string} symbol Stock symbol  
 * @returns {Promise<Object>} Technical analysis data
 */
async function getTechnicalIndicators(symbol) {
  // Placeholder - integrate with technical analysis service
  try {
    return {
      rsi: 65,                 // RSI indicator
      ema9: 50.25,             // 9-period EMA
      ema20: 49.80,            // 20-period EMA
      vwap: 50.15,             // Volume weighted average price
      atr: 2.15,               // Average true range
      aboveVWAP: true,         // Price above VWAP
      emaUptrend: true         // EMA 9 > EMA 20
    };
  } catch (error) {
    console.error(`Technical data fetch failed for ${symbol}:`, error.message);
    return {};
  }
}

// Add graceful degradation - create discovery rows even with failed enrichment
function toDiscoveryCandidate(prefilterItem, enrichResult) {
  const base = {
    ticker: prefilterItem.ticker || prefilterItem,
    score: 60, // baseline score
    price: 0,
    relVol: 1.0,
    confidence: enrichResult?.ok ? 'high' : 'low',
    meta: JSON.stringify({ 
      enrichErrors: enrichResult?.errors || [], 
      prefiltered: true 
    })
  };
  
  // If enrichment succeeded, merge data and boost score
  if (enrichResult?.ok && enrichResult.data) {
    Object.assign(base, enrichResult.data);
    base.score = Math.min(100, base.score + 20); // boost for successful enrichment
  }
  
  return base;
}

// Debug endpoint data
function getEnrichmentTelemetry() {
  return {
    counters: lastEnrichCounters,
    ts: lastEnrichTs,
    cacheSize: cache.size
  };
}

module.exports = {
  enrichFinalists,
  enrichOne,
  toDiscoveryCandidate,
  getEnrichmentTelemetry
};