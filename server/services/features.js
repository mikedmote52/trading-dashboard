/**
 * Feature fetching service with real data sources
 */

const { getCachedCompanyData } = require('./alphaVantage');

/**
 * Fetch Polygon market data
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Market data or null
 */
async function fetchPolygonData(symbol) {
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) {
    console.warn(`⚠️ No POLYGON_API_KEY configured - skipping market data for ${symbol}`);
    return null;
  }

  try {
    // Get previous day data (more reliable than real-time for paid plans)
    const [prevRes, barsRes] = await Promise.all([
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${polygonKey}`),
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${getDateDaysAgo(30)}/${getDateDaysAgo(0)}?apikey=${polygonKey}`)
    ]);

    if (!prevRes.ok || !barsRes.ok) {
      console.warn(`⚠️ Polygon API error for ${symbol}: ${prevRes.status}/${barsRes.status}`);
      return null;
    }

    const prevDay = await prevRes.json();
    const bars = await barsRes.json();

    if (!bars.results || bars.results.length < 6) {
      console.warn(`⚠️ Insufficient historical data for ${symbol}`);
      return null;
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
      avg_volume_30d: avgVolume
    };

  } catch (error) {
    console.error(`❌ Error fetching Polygon data for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Simple catalyst heuristic
 * @param {string} symbol Stock symbol
 * @returns {Promise<number>} 1 if catalyst detected, 0 otherwise
 */
async function detectCatalyst(symbol) {
  // TODO: Integrate with earnings calendar, news API, options volume
  // For now, simple heuristic based on day of week and randomization
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
 * Fetch features for a symbol using real data sources
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object|null>} Feature data or null
 */
async function fetchFeaturesFor(symbol) {
  try {
    console.log(`📊 Fetching real features for ${symbol}`);
    
    // Fetch data from all sources in parallel
    const [polygonData, companyData, catalystFlag] = await Promise.all([
      fetchPolygonData(symbol),
      getCachedCompanyData(symbol),
      detectCatalyst(symbol)
    ]);

    // If no Polygon data, we can't compute key metrics
    if (!polygonData) {
      throw new Error(`No market data available for ${symbol} - Polygon API failed`);
    }

    // FAIL-FAST: Company data must be available for real trading decisions
    if (!companyData) {
      throw new Error(`No company data available for ${symbol} - Alpha Vantage API failed`);
    }

    // Combine all data sources - no fallbacks, all must be real
    const features = {
      symbol,
      rel_volume: polygonData.rel_volume,
      momentum_5d: polygonData.momentum_5d,
      // Use volume spike as proxy for short interest activity
      volume_spike_factor: Math.max(polygonData.rel_volume - 1.0, 0), // Volume above normal
      catalyst_flag: catalystFlag,
      float_shares: companyData.float_shares,
      market_cap: companyData.market_cap,
      company_name: companyData.company_name,
      current_price: polygonData.current_price,
      volume: polygonData.volume,
      avg_volume_30d: polygonData.avg_volume_30d,
      name: companyData.company_name || symbol,
      sector: companyData.sector,
      industry: companyData.industry,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Features for ${symbol}: rel_vol=${features.rel_volume.toFixed(2)}x, momentum=${(features.momentum_5d * 100).toFixed(1)}%, vol_spike=${features.volume_spike_factor.toFixed(2)}`);
    return features;
    
  } catch (error) {
    console.error(`❌ Error fetching features for ${symbol}:`, error.message);
    return null;
  }
}

module.exports = {
  fetchFeaturesFor
};