const { spawn } = require("child_process");
const path = require("path");
const cache = require("./cache");

const REFRESH_MS = Number(process.env.V2_REFRESH_MS || 30_000);
const PY = process.env.PYTHON_BIN || "python3";
const SCRIPT = process.env.SCREENER_V2_SCRIPT || path.resolve("agents/universe_screener.py");
const CWD = process.env.SCREENER_CWD || process.cwd();

let timer = null;

function runOnce() {
  return new Promise((resolve, reject) => {
    const args = [SCRIPT, "--limit", "10", "--exclude-symbols", "BTAI,KSS,UP,TNXP"];
    console.log(`🔄 V2 Worker: Starting background refresh...`);
    
    const proc = spawn(PY, args, {
      cwd: CWD,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));

    proc.on("close", (code) => {
      if (code === 0) {
        try {
          // Parse output similar to existing alphastack route
          const lines = out.split('\n');
          const jsonLine = lines.find(line => line.trim().startsWith('['));
          
          if (jsonLine) {
            const parsed = JSON.parse(jsonLine);
            const tickers = parsed.map(candidate => candidate.symbol || candidate);
            cache.setSnapshot(tickers || []);
            console.log(`✅ V2 Worker: Cache updated with ${(tickers || []).length} candidates`);
            resolve({ ok: true, count: (tickers || []).length });
          } else {
            cache.setSnapshot([]);
            console.log(`⚠️ V2 Worker: No candidates found in output`);
            resolve({ ok: true, count: 0 });
          }
        } catch (e) {
          cache.setError(e);
          console.error(`❌ V2 Worker: Parse error:`, e.message);
          reject(new Error(`parse error: ${e.message}; stderr: ${err}`));
        }
      } else {
        // code 2 has been observed — record & reject so supervisor can backoff/retry
        const error = new Error(`exit ${code}: ${err}`);
        cache.setError(error);
        console.error(`❌ V2 Worker: Python exit ${code}:`, err.substring(0, 200));
        reject(error);
      }
    });

    proc.on("error", (error) => {
      cache.setError(error);
      console.error(`❌ V2 Worker: Spawn error:`, error.message);
      reject(error);
    });
  });
}

function scheduleLoop() {
  let backoff = 5_000; // start small
  const maxBackoff = 120_000;

  async function tick() {
    try {
      await runOnce();
      backoff = REFRESH_MS; // success → normal cadence
    } catch (e) {
      // failure → exponential backoff
      backoff = Math.min(backoff * 2, maxBackoff);
      console.error(`❌ V2 Worker: Refresh failed, backing off ${backoff}ms:`, e.message);
    } finally {
      timer = setTimeout(tick, backoff);
    }
  }

  if (timer) clearTimeout(timer);
  console.log(`🚀 V2 Worker: Starting background loop (${REFRESH_MS}ms refresh)`);
  timer = setTimeout(tick, 1_000);
}

function stop() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    console.log(`🛑 V2 Worker: Stopped background loop`);
  }
}

module.exports = { scheduleLoop, stop };