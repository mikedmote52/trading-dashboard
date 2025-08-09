/**
 * Alpha Vantage API Service
 * Provides free market data including fundamentals and company overview
 */

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get Alpha Vantage configuration
 */
function getAlphaVantageConfig() {
  return {
    apiKey: process.env.ALPHA_VANTAGE_API_KEY,
    enabled: !!process.env.ALPHA_VANTAGE_API_KEY,
    baseUrl: 'https://www.alphavantage.co/query'
  };
}

/**
 * Fetch company overview data from Alpha Vantage
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Company data or null
 */
async function fetchCompanyOverview(symbol) {
  const config = getAlphaVantageConfig();
  
  if (!config.enabled) {
    throw new Error('ALPHA_VANTAGE_API_KEY not configured - cannot fetch company data');
  }

  try {
    const url = `${config.baseUrl}?function=OVERVIEW&symbol=${symbol}&apikey=${config.apiKey}`;
    console.log(`📡 Alpha Vantage API: Fetching overview for ${symbol}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check for API errors
    if (data['Error Message']) {
      throw new Error(`Alpha Vantage API Error: ${data['Error Message']}`);
    }
    
    if (data['Note']) {
      throw new Error(`Alpha Vantage API Limit: ${data['Note']}`);
    }
    
    // Check if we got valid data
    if (!data.Symbol || data.Symbol !== symbol) {
      console.warn(`⚠️ No valid data returned for ${symbol}`);
      return null;
    }
    
    return {
      symbol: data.Symbol,
      company_name: data.Name,
      market_cap: parseInt(data.MarketCapitalization) || null,
      shares_outstanding: parseInt(data.SharesOutstanding) || null,
      float_shares: parseInt(data.SharesFloat) || parseInt(data.SharesOutstanding) || 50000000,
      pe_ratio: parseFloat(data.PERatio) || null,
      beta: parseFloat(data.Beta) || null,
      sector: data.Sector,
      industry: data.Industry,
      source: 'alpha_vantage',
      updated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error(`❌ Error fetching Alpha Vantage data for ${symbol}:`, error.message);
    throw error;
  }
}

/**
 * Fetch intraday data for volume analysis
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Intraday data or null
 */
async function fetchIntradayData(symbol) {
  const config = getAlphaVantageConfig();
  
  if (!config.enabled) {
    throw new Error('ALPHA_VANTAGE_API_KEY not configured - cannot fetch intraday data');
  }

  try {
    const url = `${config.baseUrl}?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=5min&outputsize=compact&apikey=${config.apiKey}`;
    console.log(`📡 Alpha Vantage API: Fetching intraday for ${symbol}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check for API errors
    if (data['Error Message'] || data['Note']) {
      throw new Error(`Alpha Vantage API Error: ${data['Error Message'] || data['Note']}`);
    }
    
    const timeSeries = data['Time Series (5min)'];
    if (!timeSeries) {
      console.warn(`⚠️ No intraday data returned for ${symbol}`);
      return null;
    }
    
    // Calculate recent volume patterns
    const recentBars = Object.entries(timeSeries)
      .slice(0, 20) // Last 20 5-minute bars
      .map(([timestamp, bar]) => ({
        timestamp,
        volume: parseInt(bar['5. volume']),
        close: parseFloat(bar['4. close'])
      }));
    
    const avgVolume = recentBars.reduce((sum, bar) => sum + bar.volume, 0) / recentBars.length;
    const currentVolume = recentBars[0]?.volume || 0;
    
    return {
      current_volume: currentVolume,
      avg_recent_volume: avgVolume,
      volume_spike_ratio: avgVolume > 0 ? currentVolume / avgVolume : 1.0,
      recent_bars: recentBars.length,
      source: 'alpha_vantage',
      updated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error(`❌ Error fetching Alpha Vantage intraday data for ${symbol}:`, error.message);
    throw error;
  }
}

/**
 * Read-through cache for company data
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Cached or fresh data
 */
async function getCachedCompanyData(symbol) {
  const cacheKey = `company_${symbol}`;
  const cached = cache.get(cacheKey);
  
  // Return cached data if still valid (company data doesn't change often)
  if (cached && (Date.now() - cached.timestamp) < (CACHE_TTL * 24)) { // 24 hour cache
    return cached.data;
  }
  
  // Fetch fresh data
  const freshData = await fetchCompanyOverview(symbol);
  
  // Cache the result
  cache.set(cacheKey, {
    data: freshData,
    timestamp: Date.now()
  });
  
  return freshData;
}

/**
 * Test API connectivity
 * @returns {Promise<Object>} Status object with timestamp
 */
async function testConnection() {
  const config = getAlphaVantageConfig();
  
  if (!config.enabled) {
    throw new Error('ALPHA_VANTAGE_API_KEY not configured');
  }
  
  try {
    // Test with a simple query
    const url = `${config.baseUrl}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${config.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data['Error Message'] || data['Note']) {
      throw new Error(data['Error Message'] || data['Note']);
    }
    
    return {
      status: 'OK',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    throw new Error(`Alpha Vantage connection failed: ${error.message}`);
  }
}

/**
 * Clear cache (useful for testing)
 */
function clearCache() {
  cache.clear();
}

module.exports = {
  getCachedCompanyData,
  fetchCompanyOverview,
  fetchIntradayData,
  testConnection,
  clearCache,
  getAlphaVantageConfig
};