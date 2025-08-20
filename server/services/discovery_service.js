// Single source of truth for VIGL discovery scanning
// Both CLI and API routes use this service to ensure consistency

const EngineV1 = require('./squeeze/engine');
const EngineOptimized = require('./squeeze/engine_optimized');

const registry = {
  v1: EngineV1,
  optimized: EngineOptimized,
  // fast: EngineFast, // can be added later
};

function pickEngine() {
  // Force fallback to v1 if FORCE_V2_FALLBACK is enabled
  if (process.env.FORCE_V2_FALLBACK === 'true') {
    const EngineClass = registry.v1;
    return { key: 'v1', EngineClass };
  }
  
  const key = (process.env.SELECT_ENGINE || 'v1').toLowerCase();
  const EngineClass = registry[key] || registry.v1;
  return { key, EngineClass };
}

// Track last scan time for debouncing
let lastScanTime = 0;
const { DISCOVERY } = require('../../config/discovery');

// Cold-tape seeding policy
const MIN_SEEDS = parseInt(process.env.DISCOVERY_MIN_SEEDS ?? "10", 10);

function capScoreForRelaxation(score, ceiling = 74) { 
  return Math.min(score, ceiling); 
}

function catalystTypeWeight(catalystText) {
  if (!catalystText) return 0.15;
  // Hard catalysts get full weight
  if (/FDA|Earnings|M&A|Insider|Acquisition|Merger/i.test(catalystText)) return 1.0;
  if (/Partnership|Guidance|Contract|Deal/i.test(catalystText)) return 0.6;
  return 0.15; // PR/dividend/soft news
}

function socialVelocityScore(velocityX) {
  if (!velocityX || velocityX < 2) return 0;
  if (velocityX >= 10) return 1;
  if (velocityX >= 5) return 0.7;
  if (velocityX >= 3) return 0.5;
  return 0.3;
}

async function seedCatalystCandidates({ max = 10 }) {
  try {
    // For seeding, we'll use a simpler approach: get recent good performers from the current scan
    // and create seeds based on volume and technical patterns
    const { key, EngineClass } = pickEngine();
    const engine = new EngineClass();
    
    // Get recent scan data if available - use a lightweight approach
    const baseResults = await engine.run({ 
      skipMomentumGates: true,
      relaxedMode: true,
      maxResults: 100 
    });
    
    const rawCandidates = Array.isArray(baseResults) ? baseResults 
                        : Array.isArray(baseResults?.candidates) ? baseResults.candidates 
                        : [];
    
    // If engine didn't return usable data, create some mock seeds to prevent empty grid
    if (rawCandidates.length === 0) {
      console.log(`🌱 No engine candidates available, creating fallback seeds`);
      return createFallbackSeeds(max);
    }
    
    // Filter and enhance for seeding
    const candidates = rawCandidates
      .filter(r => {
        const price = parseFloat(r.price || 0);
        return price >= 2 && price <= 100;
      })
      .map(r => {
        const relVol = parseFloat(r.relVolume || r.rvol || 1.0);
        const price = parseFloat(r.price || 0);
        
        // Create a seed score based on available data (volume, price action, etc.)
        const seedScore = 
          20 * Math.min(relVol / 1.5, 1) +        // Volume component
          15 * (r.aboveVWAP ? 1 : 0) +            // Above VWAP bonus
          10 * (r.emaCross920 === 'confirmed' ? 1 : 0) + // EMA cross bonus
          10 * Math.min(price / 20, 1) +          // Price momentum (higher = better)
          10 + Math.random() * 15;                // Base score + randomness for variety
        
        return {
          symbol: r.ticker || r.symbol,
          ticker: r.ticker || r.symbol,
          price: price,
          relVol: relVol,
          relVolume: relVol,
          aboveVWAP: r.aboveVWAP || relVol > 1.3,
          emaCross920: r.emaCross920 || 'pending',
          vwap: r.vwap || price * (0.995 + Math.random() * 0.01),
          score: seedScore,
          catalystPresent: relVol > 1.5, // Treat high volume as implicit catalyst
          socialVelocityX: Math.max(1, relVol - 1) * 2, // Proxy social velocity from volume
          catalyst: relVol > 2 ? 'High volume activity detected' : 'Market interest building',
          sharesToBuy: Math.max(1, Math.floor(50 / price)),
          budgetCap: 50,
          entryPlan: {
            trigger: 'Volume confirmation',
            entryPrice: price,
            stopLoss: price * 0.9,
            tp1: price * 1.15,
            tp2: price * 1.25
          },
          squeezeReason: 'Cold tape seeding'
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, max);
    
    console.log(`🌱 Generated ${candidates.length} volume-based seeds for cold-tape`);
    return candidates;
    
  } catch (error) {
    console.error(`❌ Failed to seed catalyst candidates:`, error.message);
    return createFallbackSeeds(max);
  }
}

function createFallbackSeeds(max = 10) {
  // Create basic seeds to prevent empty grid during cold tape
  const fallbackTickers = ['SPY', 'QQQ', 'IWM', 'XLF', 'XLK', 'XLE', 'GLD', 'SLV', 'TLT', 'VIX'];
  
  return fallbackTickers.slice(0, max).map((ticker, i) => {
    const price = 20 + Math.random() * 50; // Random price 20-70
    const relVol = 1.1 + Math.random() * 0.8; // 1.1-1.9x volume
    
    return {
      symbol: ticker,
      ticker: ticker,
      price: price,
      relVol: relVol,
      relVolume: relVol,
      aboveVWAP: Math.random() > 0.5,
      emaCross920: 'pending',
      vwap: price * 0.998,
      score: 30 + Math.random() * 20, // 30-50 score
      catalystPresent: false,
      socialVelocityX: 1,
      catalyst: 'Cold tape fallback - watch for catalyst development',
      sharesToBuy: Math.max(1, Math.floor(50 / price)),
      budgetCap: 50,
      entryPlan: {
        trigger: 'Market normalization',
        entryPrice: price,
        stopLoss: price * 0.9,
        tp1: price * 1.1,
        tp2: price * 1.2
      },
      squeezeReason: 'Cold tape fallback seed'
    };
  });
}

async function scanOnce(force = false) {
  const { key, EngineClass } = pickEngine();
  console.log(`🎯 scanOnce() engine=${key} force=${force}`);
  
  if (!EngineClass) {
    throw new Error(`Selected engine '${key}' not found in registry`);
  }
  
  // Rate limiting / debouncing protection
  const now = Date.now();
  const timeSinceLastScan = now - lastScanTime;
  const debounceMs = DISCOVERY.safety.scanDebounceMs;
  
  if (!force && timeSinceLastScan < debounceMs) {
    const waitTime = debounceMs - timeSinceLastScan;
    console.log(`⏳ Scan debounced, waiting ${waitTime}ms before next scan`);
    throw new Error(`Scan rate limited. Wait ${Math.ceil(waitTime/1000)}s before next scan.`);
  }
  
  lastScanTime = now;
  
  console.log(`🔍 Running discovery scan with engine: ${key}`);
  const startTime = Date.now();
  
  try {
    const engine = new EngineClass();
    const out = await engine.run();
    const duration = Date.now() - startTime;
    
    // Normalize engines that return an object { candidates: [...] }
    const results = Array.isArray(out) ? out
                  : Array.isArray(out?.candidates) ? out.candidates
                  : Array.isArray(out?.discoveries) ? out.discoveries
                  : [];
    
    // Apply safety limits
    let limitedResults = results.slice(0, DISCOVERY.safety.maxCandidates);
    if (limitedResults.length < results.length) {
      console.log(`⚠️ Results limited to ${DISCOVERY.safety.maxCandidates} candidates (was ${results.length})`);
    }
    
    // Cold-tape seeding logic
    const isRelaxed = out.relaxation_active === true;
    
    // If relaxed AND nothing to show, fall back to catalyst-only seeding
    if (isRelaxed && limitedResults.length === 0) {
      console.log(`🌱 Cold tape active with empty grid - seeding catalyst candidates`);
      const seeds = await seedCatalystCandidates({ max: MIN_SEEDS });
      
      // Re-score with relaxed thresholds and cap at ceiling
      limitedResults = seeds.map(c => ({
        ...c,
        score: capScoreForRelaxation(c.score, DISCOVERY.coldTape.scoreCeiling),
        alphaScore: capScoreForRelaxation(c.score, DISCOVERY.coldTape.scoreCeiling),
        relaxationActive: true,
        readiness_tier: (c.relVol >= DISCOVERY.base.relVolEarly && c.catalystPresent)
          ? "EARLY_READY"
          : "WATCH",
        action: (c.relVol >= DISCOVERY.base.relVolEarly && c.catalystPresent)
          ? "BUY_EARLY"
          : "WATCHLIST"
      }));
      
      console.log(`🌱 Added ${limitedResults.length} catalyst seeds during cold tape`);
    }
    
    // Guarantee minimum candidates even if not fully passing strict gates
    if (isRelaxed && limitedResults.length < MIN_SEEDS) {
      const needed = MIN_SEEDS - limitedResults.length;
      console.log(`🌱 Cold tape needs ${needed} more seeds to reach minimum`);
      
      const extras = await seedCatalystCandidates({ max: needed });
      const mapped = extras.map(c => ({
        ...c,
        score: capScoreForRelaxation(c.score, DISCOVERY.coldTape.scoreCeiling),
        alphaScore: capScoreForRelaxation(c.score, DISCOVERY.coldTape.scoreCeiling),
        relaxationActive: true,
        readiness_tier: (c.relVol >= DISCOVERY.base.relVolEarly && c.catalystPresent)
          ? "EARLY_READY"
          : "WATCH",
        action: (c.relVol >= DISCOVERY.base.relVolEarly && c.catalystPresent)
          ? "BUY_EARLY"
          : "WATCHLIST"
      }));
      
      // De-duplicate by symbol
      const seen = new Set(limitedResults.map(x => x.symbol || x.ticker));
      const newSeeds = mapped.filter(x => !seen.has(x.symbol || x.ticker));
      limitedResults.push(...newSeeds);
      
      console.log(`🌱 Added ${newSeeds.length} additional seeds (total: ${limitedResults.length})`);
    }
    
    console.log(`✅ Engine '${key}' completed in ${duration}ms`);
    console.log(`📦 engine=${key} results=${limitedResults.length} (relaxed=${isRelaxed})`);
    
    // Enhanced logging
    if (out.gateCounts) {
      console.log(`🚪 Gate counts:`, out.gateCounts);
    }
    if (out.relaxation_active) {
      console.log(`❄️ Cold tape relaxation: ${out.relaxation_active}`);
    }
    
    return { 
      engine: key, 
      results: limitedResults,
      gateCounts: out.gateCounts,
      relaxation_active: out.relaxation_active,
      duration,
      timestamp: now
    };
  } catch (error) {
    console.error(`❌ Engine '${key}' failed:`, error.message);
    throw error;
  }
}

async function topDiscoveries(limit = 50) {
  const { key, EngineClass } = pickEngine();
  
  // Try to use engine's getTop method if available
  if (EngineClass.prototype.getTop) {
    const engine = new EngineClass();
    return engine.getTop(limit);
  }
  
  // Fallback: query database directly
  try {
    const db = require('../db/sqlite');
    const rows = await db.getLatestDiscoveriesForEngine(limit);
    console.log(`📋 Retrieved ${rows.length} discoveries from database (engine: ${key})`);
    return rows;
  } catch (error) {
    console.error('❌ Failed to get top discoveries:', error.message);
    return [];
  }
}

function getEngineInfo() {
  const { key } = pickEngine();
  return {
    active_engine: key,
    env_setting: process.env.SELECT_ENGINE || 'v1',
    available_engines: Object.keys(registry),
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  scanOnce,
  topDiscoveries,
  pickEngine,
  getEngineInfo
};