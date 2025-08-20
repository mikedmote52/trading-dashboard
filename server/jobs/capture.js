const { v4: uuidv4 } = require('uuid');
const { insertFeaturesSnapshot, upsertDiscovery } = require('../db/sqlite');
const { fetchFeaturesForSymbols } = require('../services/features');
const { squeezeScore } = require('../services/scoring');

// Import new VIGL discovery components
const { enrichFinalists } = require('../services/enrichment');
const { viglScore } = require('../services/vigl-scoring');
const { saveDiscoveryAtomic } = require('../db/discoveries-repository');

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
        // Ensure we have a valid price before persisting
        const price = features.price || features.currentPrice || 0;
        if (!price || price <= 0) {
          console.log(`⚠️ Skipping ${symbol} - no valid price (${price})`);
          continue;
        }
        
        const discoveryId = uuidv4();
        // Use the simplified prepared statement that matches the schema
        upsertDiscovery.run({
          id: discoveryId,
          symbol,
          score: score,
          features_json: JSON.stringify({
            ...features,
            price: price,
            asof: today,
            created_at: Date.now()
          })
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
  // Read scan interval from environment (defaults to 30 minutes)
  const scanIntervalMin = parseInt(process.env.SCAN_INTERVAL_MIN || process.env.ALERTS_MINUTES || 30);
  const scanInterval = scanIntervalMin * 60 * 1000;
  
  console.log(`⏰ Daily capture interval configured: ${scanIntervalMin} minutes`);
  
  // Run initial capture
  runDiscoveryCapture();
  
  // Schedule based on environment configuration
  setInterval(() => {
    runDiscoveryCapture();
  }, scanInterval);
}

/**
 * Get all active tradeable stocks from market (returns both symbols and ticker data)
 */
async function getMarketUniverseWithData() {
  try {
    const axios = require('axios');
    const POLYGON_KEY = process.env.POLYGON_API_KEY;
    
    if (!POLYGON_KEY) {
      console.log('⚠️ No Polygon API key, using default symbols');
      const defaultSymbols = process.env.SCAN_SYMBOLS 
        ? process.env.SCAN_SYMBOLS.split(',')
        : ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
      return { 
        symbols: defaultSymbols, 
        tickers: [] // No ticker data available without API key
      };
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
        .slice(0, 200); // Top 200 most liquid
      
      if (tradeable.length > 0) {
        console.log(`📊 Got ${tradeable.length} liquid stocks from market for prefiltering`);
        return {
          symbols: tradeable.map(t => t.ticker),
          tickers: tradeable
        };
      }
    }
    
    // Fallback to configured symbols or defaults
    console.log('⚠️ Using fallback symbols');
    const fallbackSymbols = process.env.SCAN_SYMBOLS 
      ? process.env.SCAN_SYMBOLS.split(',')
      : ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL', 
         'SPY', 'QQQ', 'NVAX', 'SNDL', 'PLTR', 'NIO', 'AAL', 'F', 'GE', 'BAC'];
    return {
      symbols: fallbackSymbols,
      tickers: [] // No ticker data for fallback
    };
  } catch (error) {
    console.error('⚠️ Error fetching market universe:', error.message);
    // Return defaults on error
    const errorFallback = process.env.SCAN_SYMBOLS 
      ? process.env.SCAN_SYMBOLS.split(',')
      : ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
    return {
      symbols: errorFallback,
      tickers: []
    };
  }
}

/**
 * Get all active tradeable stocks from market (legacy function for compatibility)
 */
async function getMarketUniverse() {
  const { symbols } = await getMarketUniverseWithData();
  return symbols;
}

// Import the new prefilter service
const { prefilterUniverse } = require('../services/prefilter');

/**
 * Run VIGL discovery using complete optimized pipeline
 */
async function runVIGLDiscovery() {
  try {
    console.log('🎯 Starting VIGL Discovery Pipeline...');
    
    // Stage 1: Get market universe and prefilter to candidates
    const { symbols, tickers } = await getMarketUniverseWithData();
    const { ranked: candidates, metrics } = prefilterUniverse(tickers);
    
    console.log(`📊 Prefilter: ${metrics.universe} universe → ${candidates.length} candidates`);
    
    if (candidates.length === 0) {
      console.log('⚠️ No candidates passed prefiltering');
      return [];
    }
    
    // Stage 2: Enrich finalists with comprehensive data
    console.log(`🔬 Enriching ${candidates.length} finalists...`);
    const enrichedCandidates = await enrichFinalists(candidates);
    
    if (enrichedCandidates.length === 0) {
      console.log('⚠️ No candidates survived enrichment');
      return [];
    }
    
    // Stage 3: VIGL scoring and classification
    console.log(`🧮 VIGL scoring ${enrichedCandidates.length} enriched candidates...`);
    const viglResults = [];
    const asof = new Date();
    
    for (const candidate of enrichedCandidates) {
      try {
        const scored = viglScore(candidate);
        
        // Stage 4: Atomic persistence with price validation
        const saveResult = saveDiscoveryAtomic(scored, asof);
        
        if (saveResult.success) {
          viglResults.push(scored);
          console.log(`💾 ${scored.symbol}: score=${scored.score}, action=${scored.action}`);
        } else {
          console.log(`⚠️ Skipped saving ${scored.symbol}: ${saveResult.reason || saveResult.error}`);
        }
        
      } catch (scoringError) {
        console.error(`❌ VIGL scoring failed for ${candidate.symbol}:`, scoringError.message);
      }
    }
    
    console.log(`✅ VIGL Discovery Complete: ${viglResults.length} discoveries persisted`);
    
    // Summary statistics
    const summary = {
      universe: metrics.universe,
      prefiltered: candidates.length,
      enriched: enrichedCandidates.length,
      discoveries: viglResults.length,
      actions: {
        BUY: viglResults.filter(r => r.action === 'BUY').length,
        WATCHLIST: viglResults.filter(r => r.action === 'WATCHLIST').length,
        MONITOR: viglResults.filter(r => r.action === 'MONITOR').length,
        DROP: viglResults.filter(r => r.action === 'DROP').length
      },
      avgScore: viglResults.length > 0 ? 
        +(viglResults.reduce((sum, r) => sum + r.score, 0) / viglResults.length).toFixed(2) : 0
    };
    
    console.log(`📊 VIGL Summary:`, summary);
    return viglResults;
    
  } catch (error) {
    console.error('❌ VIGL Discovery Pipeline Error:', error.message);
    throw error;
  }
}

/**
 * Run discovery capture immediately (legacy compatibility)
 */
async function runDiscoveryCapture() {
  // Use new VIGL pipeline if available, fall back to legacy
  if (process.env.USE_VIGL_PIPELINE === 'true') {
    return runVIGLDiscovery();
  }
  
  try {
    console.log('🔍 Running legacy discovery capture...');
    
    // Get full market snapshot with ticker data for prefiltering
    const { symbols, tickers } = await getMarketUniverseWithData();
    
    // Apply prefiltering to get top candidates only  
    const { ranked: candidates, metrics } = prefilterUniverse(tickers);
    console.log(`📊 Prefilter metrics:`, metrics);
    
    if (candidates.length === 0) {
      console.log('⚠️ No candidates passed prefiltering criteria');
      return [];
    }
    
    console.log(`🎯 Processing ${candidates.length} prefiltered candidates (vs ${symbols.length} total universe)`);
    
    const discoveries = await captureDaily(candidates);
    console.log(`✅ Capture complete: ${discoveries.length} discoveries from ${candidates.length} candidates`);
    
    return discoveries;
  } catch (error) {
    console.error('❌ Capture job error:', error);
    throw new Error(`Discovery capture failed: ${error.message}`);
  }
}

module.exports = {
  captureDaily,
  startDailyCapture,
  runDiscoveryCapture,
  runVIGLDiscovery
};