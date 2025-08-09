/**
 * Feature fetching service using Alpaca Market Data, Polygon, and Fintel
 * No Alpha Vantage dependencies - strict fail-fast mode
 */

const { getQuote, getLastTrade } = require('./providers/prices');
const { getCompanyProfile } = require('./providers/fundamentals');
const { getBorrowData } = require('./providers/borrow');
const { runQueued, createSymbolTasks } = require('./queue');

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
  try {
    console.log(`📊 Fetching comprehensive features for ${symbol}`);
    
    // Fetch data from all providers - borrow data optional
    const [quote, lastTrade, polygonData, companyData, catalystFlag] = await Promise.all([
      getQuote(symbol),
      getLastTrade(symbol),
      fetchPolygonData(symbol),
      getCompanyProfile(symbol),
      Promise.resolve(detectCatalyst(symbol))
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

    // Core data sources must succeed - borrow data optional
    if (!quote) throw new Error(`No quote data for ${symbol}`);
    if (!lastTrade) throw new Error(`No trade data for ${symbol}`);
    if (!polygonData) throw new Error(`No historical data for ${symbol}`);
    if (!companyData) throw new Error(`No company data for ${symbol}`);

    // Combine all data sources into comprehensive features
    const features = {
      symbol: symbol.toUpperCase(),
      
      // Price data (Alpaca Market Data v2)
      current_price: lastTrade.price,
      bid: quote.bid,
      ask: quote.ask,
      spread: quote.spread,
      
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
        prices: quote.source,
        trades: lastTrade.source,
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

module.exports = {
  fetchFeaturesFor,
  fetchFeaturesForSymbols,
  batchFetchFeatures
};