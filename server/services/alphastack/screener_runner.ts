import { runScreenerSingleton } from "../../lib/screenerSingleton";
import * as fs from "fs";
const { WORKERS_ENABLED } = require('../../../src/config/flags');

type Cache = { 
  items: any[]; 
  updatedAt: number; 
  running: boolean; 
  error: null | string 
};

const cache: Cache = { 
  items: [], 
  updatedAt: 0, 
  running: false, 
  error: null 
};

const DEFAULT_ARGS = (process.env.SCREENER_ARGS || "--limit 50 --full-universe --json-out --exclude-symbols BTAI,KSS,UP,TNXP").split(" ");
const INTERVAL_MS = Number(process.env.V2_REFRESH_MS || 120000);
const TTL_MS = Number(process.env.DISCOVERY_TTL_MS || 180000);

// Parse limit from args
let DEFAULT_LIMIT = 50;
const limitArg = DEFAULT_ARGS.find(arg => arg.includes('limit'));
if (limitArg) {
  const match = limitArg.match(/--limit[=\s]?(\d+)/);
  if (match) DEFAULT_LIMIT = parseInt(match[1]);
}

async function runOnce() {
  if (cache.running) {
    console.log('⏭️  AlphaStack scan already running, skipping...');
    return;
  }
  
  cache.running = true;
  cache.error = null;
  
  console.log('🚀 Starting AlphaStack VIGL universe scan...');
  
  try {
    const result = await runScreenerSingleton({
      limit: DEFAULT_LIMIT,
      budgetMs: 300000, // 5 minutes
      jsonOut: '/tmp/alphastack_runner.json',
      caller: 'screener_runner'
    });

    
    if (result.code === 0) {
      try {
        // Read JSON output file
        if (fs.existsSync(result.jsonOut)) {
          const jsonContent = fs.readFileSync(result.jsonOut, 'utf8');
          const data = JSON.parse(jsonContent);
          cache.items = Array.isArray(data) ? data : (data.items || []);
          cache.updatedAt = Date.now();
          cache.error = null;
          console.log(`✅ AlphaStack scan complete: ${cache.items.length} real opportunities found`);
          
          // Log sample results for verification
          if (cache.items.length > 0) {
            const sample = cache.items.slice(0, 3);
            console.log('📊 Sample discoveries:', sample.map(d => `${d.symbol || d.ticker}:${d.score}`).join(', '));
          }
        } else {
          console.log('❌ No JSON output file from AlphaStack screener');
          cache.error = 'No JSON output file from screener';
        }
      } catch (parseError) {
        console.error('❌ Failed to parse AlphaStack output:', parseError.message);
        cache.error = 'JSON parse failed: ' + parseError.message;
      }
    } else {
      console.error(`❌ AlphaStack screener failed with code ${result.code}`);
      console.error('stderr:', result.stderr.substring(0, 500));
      cache.error = `Screener exit code: ${result.code}`;
    }
    
  } catch (error) {
    cache.running = false;
    cache.error = error.message;
    console.error('❌ AlphaStack process error:', error.message);
  }
}

export function startLoop() {
  if (!WORKERS_ENABLED) return console.log('[bg] AlphaStack loop disabled (WORKERS_ENABLED=false)');
  
  console.log('🔄 Starting AlphaStack background screener loop...');
  runOnce(); // warm immediately
  const intervalId = setInterval(runOnce, INTERVAL_MS);
  
  // Cleanup on process exit
  process.on('SIGTERM', () => {
    console.log('🛑 Stopping AlphaStack screener loop...');
    clearInterval(intervalId);
  });
  
  return intervalId;
}

export function getCache() {
  // Never serve stale as "fresh": caller can see 'running' status
  const fresh = (Date.now() - cache.updatedAt) < TTL_MS;
  return { ...cache, fresh };
}

export function forceRefresh() {
  if (!cache.running) {
    console.log('🔄 Force refreshing AlphaStack cache...');
    runOnce();
    return true;
  }
  return false;
}