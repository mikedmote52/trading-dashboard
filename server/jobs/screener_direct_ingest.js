/**
 * Direct screener ingest bypass
 * Ships working signals today by writing Python screener results directly to DB
 * Bypasses broken AlphaStack/VIGL layers temporarily
 */

const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const SCRIPT = process.env.SCREENER_SCRIPT || 'agents/universe_screener_v2.py';
const JSON_OUT = process.env.SCREENER_JSON_OUT_DEFAULT || '/tmp/discovery_screener.json';

/**
 * Run Python screener directly
 */
function runPy(limit = 10, budgetMs = 12000) {
  return new Promise((resolve, reject) => {
    const args = [SCRIPT, '--limit', String(limit), '--budget-ms', String(budgetMs), '--json-out', JSON_OUT];
    console.log(`🐍 Running direct screener: python3 ${args.join(' ')}`);
    
    const child = execFile('python3', args, { timeout: budgetMs + 2000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Screener failed:', err.message);
        console.error('stderr:', stderr);
        reject(err);
      } else {
        console.log(`✅ Screener complete: ${JSON_OUT}`);
        resolve();
      }
    });
    
    child.stdout?.on('data', (d) => process.stdout.write(`[screener] ${d}`));
    child.stderr?.on('data', (d) => process.stderr.write(`[screener-err] ${d}`));
  });
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
    
    if (items.length === 0) {
      return { count: 0, message: 'No discoveries found' };
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