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
 * Run discovery capture immediately
 */
async function runDiscoveryCapture() {
  try {
    console.log('🔍 Running discovery capture...');
    
    // Default symbols to scan
    const symbols = process.env.SCAN_SYMBOLS 
      ? process.env.SCAN_SYMBOLS.split(',') 
      : ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
    
    const discoveries = await captureDaily(symbols);
    console.log(`✅ Capture complete: ${discoveries.length} discoveries`);
    
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