import { spawn } from "child_process";

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

const PY = process.env.PYTHON_BIN || "python3";
const SCR = process.env.SCREENER_SCRIPT || "agents/universe_screener.py";
const ARGS = (process.env.SCREENER_ARGS || "--limit 50 --full-universe --json-out --exclude-symbols BTAI,KSS,UP,TNXP").split(" ");
const INTERVAL_MS = Number(process.env.V2_REFRESH_MS || 120000);
const TTL_MS = Number(process.env.DISCOVERY_TTL_MS || 180000);

function runOnce() {
  if (cache.running) {
    console.log('⏭️  AlphaStack scan already running, skipping...');
    return;
  }
  
  cache.running = true;
  cache.error = null;
  
  console.log('🚀 Starting AlphaStack VIGL universe scan...');
  
  let out = "", err = "";
  const proc = spawn(PY, [SCR, ...ARGS], { 
    stdio: ["ignore", "pipe", "pipe"] 
  });

  proc.stdout.on("data", d => out += d.toString());
  proc.stderr.on("data", d => err += d.toString());

  // Timeout protection
  const timeout = setTimeout(() => {
    console.log('⚠️ AlphaStack scan timeout (5min), terminating...');
    proc.kill('SIGTERM');
    cache.running = false;
    cache.error = 'Scan timeout after 5 minutes';
  }, 300000); // 5 minutes

  proc.on("close", (code) => {
    clearTimeout(timeout);
    cache.running = false;
    
    if (code === 0) {
      try {
        // Parse JSON output from universe screener
        const lines = out.split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('['));
        
        if (jsonLine) {
          const data = JSON.parse(jsonLine);
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
          console.log('❌ No JSON output from AlphaStack screener');
          console.log('stdout:', out.substring(0, 500));
          cache.error = 'No JSON output from screener';
        }
      } catch (parseError) {
        console.error('❌ Failed to parse AlphaStack output:', parseError.message);
        console.log('stdout sample:', out.substring(0, 500));
        cache.error = 'JSON parse failed: ' + parseError.message;
      }
    } else {
      console.error(`❌ AlphaStack screener failed with code ${code}`);
      console.error('stderr:', err.substring(0, 500));
      cache.error = `Screener exit code: ${code}`;
    }
  });

  proc.on('error', (error) => {
    clearTimeout(timeout);
    cache.running = false;
    cache.error = error.message;
    console.error('❌ AlphaStack process error:', error.message);
  });
}

export function startLoop() {
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