const { v4: uuidv4 } = require('uuid');
const { insertFeaturesSnapshot, upsertDiscovery } = require('../db/sqlite');
const { fetchFeaturesForSymbols } = require('../services/features');
const { squeezeScore } = require('../services/scoring');

/**
 * Capture daily features for symbols using rate-limited queue
 * @param {Array<string>} symbols List of symbols to capture
 */
async function captureDaily(symbols = []) {
  console.log(`🧠 Starting rate-limited daily feature capture for ${symbols.length} symbols`);
  
  const discoveries = [];
  const today = new Date().toISOString().split('T')[0];
  
  // Use queue-based fetching with 1-second intervals
  const results = await fetchFeaturesForSymbols(symbols, 1000);
  
  for (const result of results) {
    if (result.failed) {
      console.log(`⚠️ Skipped ${symbols[result.index]} due to error: ${result.error}`);
      continue;
    }
    
    const features = result;
    const symbol = features.symbol;
    
    try {
      // Insert features snapshot
      const snapshotId = uuidv4();
      insertFeaturesSnapshot.run({
        id: snapshotId,
        asof: today,
        symbol,
        short_interest_pct: features.short_interest_pct || 0,
        borrow_fee_7d_change: features.borrow_fee_7d_change || 0,
        rel_volume: features.rel_volume || 1.0,
        momentum_5d: features.momentum_5d || 0,
        catalyst_flag: features.catalyst_flag || 0,
        float_shares: features.float_shares || 1000000000
      });
      
      // Calculate squeeze score
      const score = squeezeScore(features);
      console.log(`📈 ${symbol} squeeze score: ${score}`);
      
      // If high score, persist discovery (lowered threshold for testing)
      if (score >= 0.8) {
        const discoveryId = uuidv4();
        upsertDiscovery.run({
          id: discoveryId,
          asof: today,
          symbol,
          score: score,
          features_json: JSON.stringify(features),
          created_at: Date.now()
        });
        
        discoveries.push({
          symbol,
          name: features.name || symbol,
          score: score / 5.0, // Normalize to 0-1 for compatibility
          confidence: Math.min(score / 5.0, 1.0),
          features: features
        });
        
        console.log(`💾 Persisted discovery for ${symbol} with score ${score}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to process features for ${symbol}:`, error.message);
    }
  }
  
  console.log(`✅ Feature capture complete. ${discoveries.length} high-score discoveries found.`);
  return discoveries;
}

/**
 * Start daily capture job with interval
 */
function startDailyCapture() {
  // Run initial capture
  runDiscoveryCapture();
  
  // Schedule every 30 minutes
  setInterval(() => {
    runDiscoveryCapture();
  }, 30 * 60 * 1000); // 30 minutes
}

/**
 * Get all active tradeable stocks from market
 */
async function getMarketUniverse() {
  try {
    const axios = require('axios');
    const POLYGON_KEY = process.env.POLYGON_API_KEY;
    
    if (!POLYGON_KEY) {
      console.log('⚠️ No Polygon API key, using default symbols');
      return process.env.SCAN_SYMBOLS 
        ? process.env.SCAN_SYMBOLS.split(',')
        : ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
    }
    
    // Get all US stocks snapshot for high-volume movers
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_KEY}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.tickers) {
      // Filter for liquid, tradeable stocks
      const tradeable = response.data.tickers
        .filter(t => {
          return t.day && 
                 t.day.v > 1000000 && // Volume > 1M shares
                 t.day.c > 2 &&        // Price > $2
                 t.day.c < 500 &&      // Price < $500 (avoid BRK.A type stocks)
                 !t.ticker.includes('.') && // No special securities
                 t.ticker.length <= 5;  // Normal tickers only
        })
        .sort((a, b) => (b.day.v * b.day.c) - (a.day.v * a.day.c)) // Sort by dollar volume
        .slice(0, 200) // Top 200 most liquid
        .map(t => t.ticker);
      
      if (tradeable.length > 0) {
        console.log(`📊 Scanning ${tradeable.length} liquid stocks from market`);
        return tradeable;
      }
    }
    
    // Fallback to configured symbols or defaults
    console.log('⚠️ Using fallback symbols');
    return process.env.SCAN_SYMBOLS 
      ? process.env.SCAN_SYMBOLS.split(',')
      : ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL', 
         'SPY', 'QQQ', 'NVAX', 'SNDL', 'PLTR', 'NIO', 'AAL', 'F', 'GE', 'BAC'];
  } catch (error) {
    console.error('⚠️ Error fetching market universe:', error.message);
    // Return defaults on error
    return process.env.SCAN_SYMBOLS 
      ? process.env.SCAN_SYMBOLS.split(',')
      : ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
  }
}

/**
 * Run discovery capture immediately
 */
async function runDiscoveryCapture() {
  try {
    console.log('🔍 Running discovery capture...');
    
    // Get full market universe or use configured symbols
    const symbols = await getMarketUniverse();
    
    const discoveries = await captureDaily(symbols);
    console.log(`✅ Capture complete: ${discoveries.length} discoveries from ${symbols.length} stocks`);
    
    return discoveries;
  } catch (error) {
    console.error('❌ Capture job error:', error);
    throw new Error(`Discovery capture failed: ${error.message}`);
  }
}

module.exports = {
  captureDaily,
  startDailyCapture,
  runDiscoveryCapture
};