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
  const key = (process.env.SELECT_ENGINE || 'v1').toLowerCase();
  const EngineClass = registry[key] || registry.v1;
  return { key, EngineClass };
}

async function scanOnce() {
  const { key, EngineClass } = pickEngine();
  console.log(`🎯 scanOnce() engine=${key}`);
  
  if (!EngineClass) {
    throw new Error(`Selected engine '${key}' not found in registry`);
  }
  
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
    
    console.log(`✅ Engine '${key}' completed in ${duration}ms`);
    console.log(`📦 engine=${key} results=${results.length}`);
    
    return { engine: key, results };
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