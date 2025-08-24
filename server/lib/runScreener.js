// server/lib/runScreener.js
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const path = require("path");

async function runScreener({
  limit = 10,
  budgetMs = 12000,
  jsonOut = process.env.DISCOVERY_JSON_PATH || "/var/data/discovery_screener.json",
  caller = "unknown",
}) {
  const runId = `scr_${Date.now()}_${randomUUID().slice(0,8)}`;
  const t0 = Date.now();
  const script = path.resolve("agents/universe_screener_v2.py");
  const args = [
    script,
    `--limit=${limit}`,
    `--budget-ms=${budgetMs}`,
    `--json-out=${jsonOut}`,
  ];
  const env = { ...process.env, JSON_OUT: jsonOut, SCREENER_CALLER: caller, SCREENER_RUN_ID: runId };

  const py = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"], env });
  let stdout = "", stderr = "";
  py.stdout.on("data", d => { const s = d.toString(); stdout += s; process.stdout.write(`[screener:${caller}:${runId}] ${s}`); });
  py.stderr.on("data", d => { const s = d.toString(); stderr += s; process.stderr.write(`[screener-err:${caller}:${runId}] ${s}`); });

  const code = await new Promise(resolve => py.on("close", resolve));
  const durationMs = Date.now() - t0;

  // Check output file size and handle gracefully in safe mode
  try {
    const fs = require('fs');
    const { flag } = require('./envFlags');
    const SAFE_MODE = flag('SAFE_MODE', false);
    const STRICT_STARTUP = flag('STRICT_STARTUP', true);
    
    const resolvedPath = path.resolve(jsonOut);
    if (fs.existsSync(resolvedPath)) {
      const stats = fs.statSync(resolvedPath);
      if (stats.size < 5 && (SAFE_MODE || !STRICT_STARTUP)) {
        console.warn(`[screener] Output file too small (${stats.size}B), continuing in degraded mode`);
      }
    }
  } catch (e) {
    // Don't fail on file check errors
    console.warn(`[screener] Could not check output file:`, e.message);
  }

  return { runId, jsonOut: path.resolve(jsonOut), durationMs, stdout, stderr, code };
}

module.exports = { runScreener };