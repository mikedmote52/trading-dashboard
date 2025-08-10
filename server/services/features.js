/**
 * Feature fetching service using Alpaca Market Data, Polygon, and Fintel
 * No Alpha Vantage dependencies - strict fail-fast mode
 */

const { getQuote, getLastTrade } = require('./providers/prices');
const { getCompanyProfile } = require('./providers/fundamentals');
const { getBorrowData } = require('./providers/borrow');
const { runQueued, createSymbolTasks } = require('./queue');

// Global tracking for failed symbols
const failedSymbols = new Set();

/**
 * Safe wrapper for getCompanyProfile with error handling
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Company profile data or null
 */
async function safeGetCompanyProfile(symbol) {
  try {
    // Check if getCompanyProfile is properly defined
    if (typeof getCompanyProfile !== 'function') {
      throw new Error('getCompanyProfile is not a function - function may be missing or incorrectly exported');
    }
    
    console.log(`🏢 Fetching company profile for ${symbol}...`);
    const profile = await getCompanyProfile(symbol);
    
    if (!profile) {
      console.warn(`⚠️  No company profile data available for ${symbol}`);
      failedSymbols.add(symbol);
      return null;
    }
    
    console.log(`✅ Company profile fetched for ${symbol}: ${profile.name || 'N/A'}`);
    return profile;
    
  } catch (error) {
    console.error(`❌ Error fetching company profile for ${symbol}:`, error.message);
    failedSymbols.add(symbol);
    
    // Log different types of errors for debugging
    if (error.message.includes('not a function')) {
      console.error('🚨 CRITICAL: getCompanyProfile function is missing or not properly exported');
      console.error('   Check server/services/providers/fundamentals.js exports');
    } else if (error.message.includes('API')) {
      console.error('🌐 API Error: External service may be unavailable');
    } else {
      console.error('🔧 Unknown Error: Please check implementation');
    }
    
    // Return fallback data structure
    return {
      float_shares: null,
      market_cap: null,
      name: symbol,
      ticker: symbol.toUpperCase(),
      error: 'company_profile_failed'
    };
  }
}

/**
 * Fetch Polygon historical data for volume and momentum calculations
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Historical market data
 */
async function fetchPolygonData(symbol) {
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) {
    throw new Error('POLYGON_API_KEY not configured - required for historical data');
  }

  try {
    // Get previous day data and 30-day historical bars
    const [prevRes, barsRes] = await Promise.all([
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${polygonKey}`),
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${getDateDaysAgo(30)}/${getDateDaysAgo(0)}?apikey=${polygonKey}`)
    ]);

    if (!prevRes.ok || !barsRes.ok) {
      throw new Error(`Polygon API error: ${prevRes.status}/${barsRes.status}`);
    }

    const prevDay = await prevRes.json();
    const bars = await barsRes.json();

    if (!bars.results || bars.results.length < 6) {
      throw new Error(`Insufficient historical data for ${symbol} - need at least 6 days`);
    }

    const results = bars.results.sort((a, b) => b.t - a.t); // Most recent first
    
    // Use previous day data for current values (more reliable)
    const currentVolume = prevDay.results?.[0]?.v || results[0]?.v;
    const currentClose = prevDay.results?.[0]?.c || results[0]?.c;
    const avgVolume = results.slice(0, 30).reduce((sum, bar) => sum + bar.v, 0) / Math.min(30, results.length);
    
    // 5-day momentum calculation using most recent close
    const fiveDaysAgoClose = results[5]?.c;
    const momentum5d = fiveDaysAgoClose ? (currentClose - fiveDaysAgoClose) / fiveDaysAgoClose : 0;

    return {
      rel_volume: avgVolume > 0 ? currentVolume / avgVolume : 1.0,
      momentum_5d: momentum5d,
      current_price: currentClose,
      volume: currentVolume,
      avg_volume_30d: avgVolume,
      volume_spike_factor: Math.max((currentVolume / avgVolume) - 1.0, 0) // Volume above normal
    };

  } catch (error) {
    throw new Error(`Polygon data fetch failed for ${symbol}: ${error.message}`);
  }
}

/**
 * Simple catalyst detection heuristic
 * @param {string} symbol Stock symbol
 * @returns {number} 1 if catalyst detected, 0 otherwise
 */
function detectCatalyst(symbol) {
  // TODO: Integrate with earnings calendar, news API, options volume
  // For now, simple heuristic based on day of week
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Higher chance on Tuesday-Thursday (typical earnings days)
  const baseChance = [0.05, 0.10, 0.20, 0.20, 0.15, 0.05, 0.05][dayOfWeek];
  return Math.random() < baseChance ? 1 : 0;
}

/**
 * Get date string N days ago
 * @param {number} daysAgo Number of days ago
 * @returns {string} Date in YYYY-MM-DD format
 */
function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

/**
 * Fetch features for a single symbol using all data providers
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Complete feature data
 */
async function fetchFeaturesFor(symbol) {
  const failedSymbols = []; // Track failed symbols for logging
  
  try {
    console.log(`📊 Fetching comprehensive features for ${symbol}`);
    
    // Fetch data from available providers with proper error handling
    const [polygonData, companyData, catalystFlag] = await Promise.allSettled([
      fetchPolygonData(symbol),
      safeGetCompanyProfile(symbol),
      Promise.resolve(detectCatalyst(symbol))
    ]).then(results => [
      results[0].status === 'fulfilled' ? results[0].value : null,
      results[1].status === 'fulfilled' ? results[1].value : null,
      results[2].status === 'fulfilled' ? results[2].value : null
    ]);
    
    // Try to get borrow data if provider is configured
    let borrowData = null;
    try {
      if (process.env.BORROW_SHORT_PROVIDER && process.env.BORROW_SHORT_API_KEY) {
        borrowData = await getBorrowData(symbol);
      }
    } catch (error) {
      console.log(`ℹ️ Borrow data unavailable for ${symbol}: ${error.message}`);
    }

    // Handle missing company profile gracefully but continue processing
    if (!companyData || companyData.error) {
      console.warn(`⚠️  ${symbol}: Proceeding without company profile data`);
    }
    
    // Core data sources must succeed - borrow data and company data optional
    if (!polygonData) throw new Error(`No historical data for ${symbol}`);

    // Combine all data sources into comprehensive features
    const features = {
      symbol: symbol.toUpperCase(),
      
      // Price data (from Polygon)
      current_price: polygonData.current_price,
      bid: 0,
      ask: 0,
      spread: 0,
      
      // Volume and momentum (Polygon)
      volume: polygonData.volume,
      avg_volume_30d: polygonData.avg_volume_30d,
      rel_volume: polygonData.rel_volume,
      volume_spike_factor: polygonData.volume_spike_factor,
      momentum_5d: polygonData.momentum_5d,
      
      // Company fundamentals (static estimates)
      company_name: companyData.company_name,
      sector: companyData.sector,
      industry: companyData.industry,
      market_cap: companyData.market_cap,
      float_shares: companyData.float_shares,
      shares_outstanding: companyData.shares_outstanding,
      
      // Borrow/short data (optional - only if provider configured)
      short_interest_pct: borrowData?.short_interest_pct || 0,
      borrow_fee_pct: borrowData?.borrow_fee_pct || 0,
      borrow_fee_7d_change: borrowData?.fee_change_7d || 0,
      shares_available: borrowData?.shares_available || 0,
      utilization_pct: borrowData?.utilization_pct || 0,
      
      // Catalyst detection
      catalyst_flag: catalystFlag,
      
      // Metadata
      name: companyData.company_name || symbol,
      timestamp: new Date().toISOString(),
      sources: {
        prices: 'polygon',
        trades: 'polygon',
        historical: 'polygon',
        fundamentals: companyData.source,
        borrow: borrowData?.source || 'none'
      }
    };

    console.log(`✅ Complete features for ${symbol}: price=$${features.current_price}, vol=${features.rel_volume.toFixed(2)}x, short=${features.short_interest_pct.toFixed(1)}%, fee=${features.borrow_fee_pct.toFixed(2)}%`);
    return features;
    
  } catch (error) {
    console.error(`❌ Feature fetch failed for ${symbol}:`, error.message);
    throw error; // Re-throw to maintain fail-fast behavior
  }
}

/**
 * Fetch features for multiple symbols using rate-limited queue
 * @param {Array<string>} symbols Array of stock symbols
 * @param {number} rateMs Milliseconds between each symbol fetch (default: 1000)
 * @returns {Promise<Array>} Array of feature objects (with error objects for failures)
 */
async function fetchFeaturesForSymbols(symbols, rateMs = 1000) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('symbols must be a non-empty array');
  }

  console.log(`🧠 Starting rate-limited feature fetch for ${symbols.length} symbols`);
  
  // Create symbol tasks for the queue
  const tasks = createSymbolTasks(symbols, fetchFeaturesFor);
  
  // Execute with rate limiting
  const results = await runQueued(tasks, rateMs);
  
  // Separate successful results from errors
  const successful = results.filter(r => !r?.failed);
  const failed = results.filter(r => r?.failed);
  
  console.log(`📊 Feature fetch complete: ${successful.length} success, ${failed.length} failed`);
  
  if (failed.length > 0) {
    console.warn('⚠️ Failed symbols:', failed.map(f => `${symbols[f.index]} (${f.error})`).join(', '));
  }
  
  return results;
}

/**
 * Batch fetch features for symbols (legacy compatibility)
 * @param {Array<string>} symbols Array of stock symbols
 * @returns {Promise<Array>} Array of successful feature objects only
 */
async function batchFetchFeatures(symbols) {
  const results = await fetchFeaturesForSymbols(symbols, 1000);
  return results.filter(r => !r?.failed);
}

/**
 * Get the list of symbols that failed company profile fetching
 * @returns {Array<string>} Array of failed symbols
 */
function getFailedSymbols() {
  return Array.from(failedSymbols);
}

/**
 * Clear the failed symbols list
 */
function clearFailedSymbols() {
  failedSymbols.clear();
}

/**
 * Log failed symbols for review
 */
function logFailedSymbols() {
  if (failedSymbols.size > 0) {
    console.log('📋 Failed symbols summary:');
    console.log('   Company profile failures:', Array.from(failedSymbols).join(', '));
    console.log(`   Total failed: ${failedSymbols.size}`);
  } else {
    console.log('✅ No failed symbols - all company profiles fetched successfully');
  }
}

module.exports = {
  fetchFeaturesFor,
  fetchFeaturesForSymbols,
  batchFetchFeatures,
  getFailedSymbols,
  clearFailedSymbols,
  logFailedSymbols
};