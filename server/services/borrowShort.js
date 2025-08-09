/**
 * Borrow/Short Interest Data Provider Interface
 * Provides a read-through cache for short interest and borrow fee data
 */

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get provider configuration
 */
function getProviderConfig() {
  return {
    provider: process.env.BORROW_SHORT_PROVIDER || 'none',
    apiKey: process.env.BORROW_SHORT_API_KEY,
    enabled: !!(process.env.BORROW_SHORT_PROVIDER && process.env.BORROW_SHORT_API_KEY)
  };
}

/**
 * Fetch data from configured provider
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Borrow/short data or null
 */
async function fetchFromProvider(symbol) {
  const config = getProviderConfig();
  
  if (!config.enabled) {
    console.log(`📋 TODO: Configure borrow/short data provider for ${symbol}`);
    console.log(`   Set BORROW_SHORT_PROVIDER and BORROW_SHORT_API_KEY environment variables`);
    return null;
  }

  try {
    // TODO: Add provider implementations
    switch (config.provider.toLowerCase()) {
      case 'ortex':
        return await fetchFromOrtex(symbol, config.apiKey);
      case 's3':
        return await fetchFromS3(symbol, config.apiKey);
      case 'fintel':
        return await fetchFromFintel(symbol, config.apiKey);
      default:
        console.warn(`⚠️ Unknown borrow/short provider: ${config.provider}`);
        return null;
    }
  } catch (error) {
    console.error(`❌ Error fetching borrow/short data for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * TODO: Ortex provider implementation
 */
async function fetchFromOrtex(symbol, apiKey) {
  console.log(`📋 TODO: Implement Ortex API for ${symbol}`);
  // Example return structure:
  return {
    short_interest_pct: 0.15 + Math.random() * 0.3, // 15-45%
    borrow_fee_7d_change: (Math.random() - 0.5) * 0.2, // -10% to +10%
    float_shares: 20000000 + Math.random() * 80000000,
    source: 'ortex',
    updated_at: new Date().toISOString()
  };
}

/**
 * TODO: S3 partner provider implementation
 */
async function fetchFromS3(symbol, apiKey) {
  console.log(`📋 TODO: Implement S3 Partners API for ${symbol}`);
  return {
    short_interest_pct: 0.10 + Math.random() * 0.4,
    borrow_fee_7d_change: (Math.random() - 0.5) * 0.25,
    float_shares: 15000000 + Math.random() * 85000000,
    source: 's3',
    updated_at: new Date().toISOString()
  };
}

/**
 * TODO: Fintel provider implementation
 */
async function fetchFromFintel(symbol, apiKey) {
  console.log(`📋 TODO: Implement Fintel API for ${symbol}`);
  return {
    short_interest_pct: 0.08 + Math.random() * 0.35,
    borrow_fee_7d_change: (Math.random() - 0.5) * 0.3,
    float_shares: 25000000 + Math.random() * 75000000,
    source: 'fintel',
    updated_at: new Date().toISOString()
  };
}

/**
 * Read-through cache for borrow/short data
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Cached or fresh data
 */
async function readThroughCache(symbol) {
  const cacheKey = `borrow_short_${symbol}`;
  const cached = cache.get(cacheKey);
  
  // Return cached data if still valid
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  // Fetch fresh data
  const freshData = await fetchFromProvider(symbol);
  
  // Cache the result (even if null)
  cache.set(cacheKey, {
    data: freshData,
    timestamp: Date.now()
  });
  
  return freshData;
}

/**
 * Get null-safe default values for missing data
 * @param {string} symbol Stock symbol
 * @returns {Object} Default values
 */
function getDefaults(symbol) {
  return {
    short_interest_pct: 0,
    borrow_fee_7d_change: 0,
    float_shares: 50000000, // 50M default
    source: 'default',
    updated_at: new Date().toISOString()
  };
}

/**
 * Clear cache (useful for testing)
 */
function clearCache() {
  cache.clear();
}

module.exports = {
  readThroughCache,
  getDefaults,
  clearCache,
  getProviderConfig
};