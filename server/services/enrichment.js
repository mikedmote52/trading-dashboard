/**
 * Finalist Enrichment Service - Expensive Rate-Limited Feature Fetching
 * Only called for top 10-20 candidates that passed prefiltering
 */

const { DISCOVERY } = require('../../config/discovery');

/**
 * Enrich finalist candidates with comprehensive feature data
 * Uses rate limiting and concurrency control for expensive API calls
 * @param {Array<string>} symbols Array of finalist symbols to enrich
 * @returns {Promise<Array>} Enriched candidate data
 */
async function enrichFinalists(symbols) {
  if (!symbols || symbols.length === 0) {
    console.log('⚠️ No symbols provided for enrichment');
    return [];
  }
  
  console.log(`🔬 Starting finalist enrichment for ${symbols.length} candidates`);
  console.log(`🔬 Candidates: ${symbols.join(', ')}`);
  
  const results = [];
  
  // Process symbols with concurrency control
  for (let i = 0; i < symbols.length; i += DISCOVERY.concurrency) {
    const batch = symbols.slice(i, i + DISCOVERY.concurrency);
    console.log(`📊 Processing enrichment batch ${Math.floor(i/DISCOVERY.concurrency) + 1}: ${batch.join(', ')}`);
    
    const batchPromises = batch.map(async (symbol) => {
      return enrichSingleSymbol(symbol);
    });
    
    try {
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));
      
      // Rate limiting delay between batches
      if (i + DISCOVERY.concurrency < symbols.length) {
        console.log(`⏱️ Waiting 1s before next enrichment batch...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Batch enrichment failed:`, error.message);
    }
  }
  
  console.log(`✅ Enrichment complete: ${results.length}/${symbols.length} successful`);
  return results;
}

/**
 * Enrich a single symbol with comprehensive data
 * @param {string} symbol Stock symbol to enrich
 * @returns {Promise<Object|null>} Enriched data or null if failed
 */
async function enrichSingleSymbol(symbol) {
  const startTime = Date.now();
  
  try {
    // Get authoritative price quote first
    const quote = await getLatestQuote(symbol);
    if (!quote || !quote.price) {
      console.log(`⚠️ No quote data for ${symbol}`);
      return null;
    }
    
    // Get additional enrichment data with timeouts
    const [rvol, shortData, optionsData, socialData, newsData, technicals] = await Promise.allSettled([
      calculateRelativeVolume(symbol),
      getShortInterestData(symbol),
      getOptionsActivity(symbol),
      getSocialSentiment(symbol),
      getCatalystNews(symbol),
      getTechnicalIndicators(symbol)
    ]);
    
    const enriched = {
      symbol,
      price: quote.price,
      volume: quote.volume,
      rvol: rvol.status === 'fulfilled' ? rvol.value : 1.0,
      shortData: shortData.status === 'fulfilled' ? shortData.value : {},
      options: optionsData.status === 'fulfilled' ? optionsData.value : {},
      social: socialData.status === 'fulfilled' ? socialData.value : {},
      news: newsData.status === 'fulfilled' ? newsData.value : {},
      technicals: technicals.status === 'fulfilled' ? technicals.value : {},
      enrichedAt: new Date().toISOString(),
      enrichmentTime: Date.now() - startTime
    };
    
    console.log(`✅ Enriched ${symbol}: price=$${quote.price.toFixed(2)}, rvol=${enriched.rvol.toFixed(2)}x (${enriched.enrichmentTime}ms)`);
    return enriched;
    
  } catch (error) {
    console.error(`❌ Failed to enrich ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Get latest authoritative price quote
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Quote data with price and volume
 */
async function getLatestQuote(symbol) {
  // Use existing fetchFeaturesForSymbols or polygon API
  // This is a placeholder - integrate with your existing quote service
  try {
    const { fetchFeaturesForSymbols } = require('./features');
    const results = await fetchFeaturesForSymbols([symbol], 0); // No delay for single symbol
    if (results && results.length > 0 && !results[0].failed) {
      const features = results[0];
      return {
        price: features.price || features.currentPrice || 0,
        volume: features.volume || 0,
        change: features.changePercent || 0
      };
    }
  } catch (error) {
    console.error(`Quote fetch failed for ${symbol}:`, error.message);
  }
  return null;
}

/**
 * Calculate relative volume from historical data
 * @param {string} symbol Stock symbol  
 * @returns {Promise<number>} Relative volume multiplier
 */
async function calculateRelativeVolume(symbol) {
  // Placeholder - implement with your volume history service
  // Should calculate current volume vs 30-day average
  try {
    // This would typically query your volume database or API
    return 1.5; // Mock value for now
  } catch (error) {
    console.error(`RVOL calculation failed for ${symbol}:`, error.message);
    return 1.0;
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

module.exports = {
  enrichFinalists,
  enrichSingleSymbol
};