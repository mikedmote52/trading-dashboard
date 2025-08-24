/**
 * Direct screener ingest bypass
 * Ships working signals today by writing Python screener results directly to DB
 * Bypasses broken AlphaStack/VIGL layers temporarily
 */

const fs = require('fs').promises;
const path = require('path');

const JSON_OUT = process.env.SCREENER_JSON_OUT_DEFAULT || '/tmp/discovery_screener.json';

// Store last stderr for error reporting
let lastScreenerStderr = "";

/**
 * Run Python screener using singleton pattern to prevent overlapping runs
 */
async function runPy(limit = 10, budgetMs = 12000) {
  try {
    // Import the singleton wrapper (using dynamic import for .ts file)
    const { runScreenerSingleton } = require('../lib/screenerSingleton');
    
    const jsonOut = JSON_OUT;
    console.log(`🐍 Running direct screener (singleton): limit=${limit}, budget=${budgetMs}ms, out=${jsonOut}`);
    
    const result = await runScreenerSingleton({
      limit,
      budgetMs,
      jsonOut,
      caller: "direct_ingest"
    });
    
    // Store stderr for error reporting compatibility
    lastScreenerStderr = result.stderr;
    
    if (result.code !== 0) {
      throw new Error(`Python screener failed with exit code ${result.code}; stderr=${result.stderr.slice(0, 500)}`);
    }
    
    console.log(`✅ Screener complete: ${jsonOut} (${result.durationMs}ms)`);
    return result;
    
  } catch (error) {
    console.error(`❌ Screener singleton error:`, error.message);
    lastScreenerStderr = error.message;
    throw error;
  }
}

/**
 * Map Python item to DB schema
 */
function mapItem(item) {
  const uuid = require('crypto').randomUUID();
  return {
    id: uuid,
    symbol: item.ticker || item.symbol,
    score: Number(item.score ?? 60),
    price: Number(item.price ?? 0),
    preset: 'py_v2_direct',
    action: item.action || 'BUY',
    features_json: JSON.stringify({
      indicators: item.indicators || {},
      targets: item.targets || {},
      thesis: item.thesis || item.thesis_tldr || '',
      rel_vol_30m: item.rel_vol_30m || 1.0,
      timestamp: item.timestamp || Date.now()
    }),
    audit_json: JSON.stringify({
      source: 'python_screener_v2',
      run_id: `direct_${Date.now()}`,
      created_at: new Date().toISOString()
    })
  };
}

/**
 * Ingest screener results directly to database using unified schema
 */
async function ingestDirect(limit = 10, budgetMs = 12000) {
  try {
    // Run the Python screener
    await runPy(limit, budgetMs);
    
    // Read the JSON output
    const raw = await fs.readFile(JSON_OUT, 'utf8');
    const json = JSON.parse(raw);
    const items = Array.isArray(json.items) ? json.items : [];
    
    console.log(`📊 Processing ${items.length} discoveries for unified ingest`);
    
    if (!items?.length) {
      throw new Error(`No items normalized; stderr=${lastScreenerStderr || "n/a"}`);
    }
    
    // Use unified discovery ingestion
    const { ingestPyScreener } = require('../services/unified-discovery');
    const result = ingestPyScreener(items);
    
    console.log(`✅ Unified ingest complete: ${result.inserted}/${result.total} discoveries saved`);
    if (result.invalid > 0) {
      console.warn(`⚠️ ${result.invalid} items failed validation`);
    }
    if (result.errors.length > 0) {
      console.warn(`⚠️ Errors:`, result.errors.slice(0, 3));
    }
    
    return { 
      count: result.inserted, 
      total: result.total,
      sample: result.sample
    };
    
  } catch (error) {
    console.error('❌ Direct ingest failed:', error.message);
    throw error;
  }
}

module.exports = {
  ingestDirect,
  runPy,
  mapItem
};