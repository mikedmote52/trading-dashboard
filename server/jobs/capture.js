const { v4: uuidv4 } = require('uuid');
const { insertFeaturesSnapshot, upsertDiscovery } = require('../db/sqlite');
const { fetchFeaturesFor } = require('../services/features');
const { squeezeScore } = require('../services/scoring');

/**
 * Capture daily features for symbols
 * @param {Array<string>} symbols List of symbols to capture
 */
async function captureDaily(symbols = []) {
  console.log(`🧠 Starting daily feature capture for ${symbols.length} symbols`);
  
  const discoveries = [];
  const today = new Date().toISOString().split('T')[0];
  
  for (const symbol of symbols) {
    try {
      console.log(`📊 Capturing features for ${symbol}`);
      
      // Fetch features
      const features = await fetchFeaturesFor(symbol);
      
      if (!features) {
        console.log(`⚠️ No features available for ${symbol}`);
        continue;
      }
      
      // Insert features snapshot
      const snapshotId = uuidv4();
      insertFeaturesSnapshot.run({
        id: snapshotId,
        asof: today,
        symbol,
        short_interest_pct: features.short_interest_pct,
        borrow_fee_7d_change: features.borrow_fee_7d_change,
        rel_volume: features.rel_volume,
        momentum_5d: features.momentum_5d,
        catalyst_flag: features.catalyst_flag,
        float_shares: features.float_shares
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
      console.error(`❌ Failed to capture features for ${symbol}:`, error.message);
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
    return [];
  }
}

module.exports = {
  captureDaily,
  startDailyCapture,
  runDiscoveryCapture
};