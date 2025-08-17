const { spawn } = require("child_process");
const path = require("path");

// Runs the python screener once and returns tickers[]
module.exports = function runDirectOnce() {
  const PY = process.env.PYTHON_BIN || "python3";
  const SCRIPT = process.env.SCREENER_V2_SCRIPT || path.resolve("agents/universe_screener.py");

  return new Promise((resolve, reject) => {
    const proc = spawn(PY, [SCRIPT, "--limit", "10", "--exclude-symbols", "BTAI,KSS,UP,TNXP"], {
      cwd: process.env.SCREENER_CWD || process.cwd(),
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
            resolve(tickers || []);
          } else {
            resolve([]);
          }
        } catch (e) {
          reject(new Error(`parse error: ${e.message}\nstdout:\n${out}\nstderr:\n${err}`));
        }
      } else {
        reject(new Error(`python exited with code ${code}\nstderr:\n${err}`));
      }
    });

    proc.on("error", (error) => {
      reject(new Error(`spawn error: ${error.message}`));
    });
  });
};