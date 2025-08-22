const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BIN = process.env.SCREENER_BIN || 'python3';

function tmpFile(prefix='screener') {
  return path.join(os.tmpdir(), `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
}

async function runScreener(profileArgs = [], timeoutMs = 180000) {
  // If profileArgs is an object with timeoutMs, use it
  if (typeof profileArgs === 'object' && !Array.isArray(profileArgs) && profileArgs.timeoutMs) {
    timeoutMs = profileArgs.timeoutMs;
    profileArgs = profileArgs.args || [];
  }
  const screenerPath = process.env.SCREENER_SCRIPT || 'agents/universe_screener_v2.py';
  const outPath = tmpFile();
  const args = [screenerPath, '--json-out', outPath, ...profileArgs];
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const p = spawn(BIN, args, { 
      stdio: ['ignore', 'pipe', 'pipe'] 
    });
    
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d.toString());
    p.stderr.on('data', d => stderr += d.toString());
    
    // Kill after budget with small grace period
    const killAfter = timeoutMs + 1000;
    const killer = setTimeout(() => {
      p.kill('SIGTERM');
      setTimeout(() => p.kill('SIGKILL'), 1000);
    }, killAfter);
    
    p.on('close', (exitCode) => {
      clearTimeout(killer);
      const duration = Date.now() - start;
      
      // Clean up temp file after reading
      const cleanup = () => {
        try { 
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        } catch {}
      };

      // Read JSON file if present
      let json = null, raw = null;
      try {
        if (fs.existsSync(outPath)) {
          raw = fs.readFileSync(outPath, 'utf8');
          if (raw && raw.trim().length) {
            json = JSON.parse(raw);
          }
        }
      } catch (e) {
        // fall through
      }

      if (!json) {
        const msg = `[runScreener] No JSON output from screener. exit=${exitCode} duration=${duration}ms stdout=${stdout.slice(0,500)} stderr=${stderr.slice(0,500)}`;
        cleanup();
        return reject(new Error(msg));
      }

      // Basic schema guard
      if (!Array.isArray(json.items) || typeof json.count !== 'number') {
        const msg = `[runScreener] Invalid JSON schema: ${raw?.slice(0,200)}`;
        cleanup();
        return reject(new Error(msg));
      }

      cleanup();
      resolve({ json, exitCode, duration, stdout, stderr });
    });
  });
}

function parseRobust(s0){ const s=(s0||'').trim(); if(!s) return null;
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try { return JSON.parse(s); } catch {}
  }
  const lines = s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); const arr=[];
  for (const ln of lines){ const o=extractLastJson(ln); if(o) arr.push(o); }
  if (arr.length) return arr;
  const last = extractLastJson(s); if (last) return Array.isArray(last)? last : { items: last.items ?? [] };
  return null;
}
function extractLastJson(s){ const a=s.lastIndexOf('{'); const b=s.lastIndexOf('}');
  if (a>=0 && b>a){ try { return JSON.parse(s.slice(a,b+1)); } catch {} } return null; }
function salvageJson(s0){ const s=(s0||'').trim(); if(!s) return null;
  let depth=0,start=-1,end=-1; for(let i=0;i<s.length;i++){ const c=s[i];
    if(c==='{'){ if(depth===0) start=i; depth++; } else if(c==='}'){ depth--; if(depth===0) end=i; } }
  if(start>=0 && end>start){ try { return JSON.parse(s.slice(start,end+1)); } catch {} } return null;
}

// Legacy function wrapper for compatibility
function runScreenerLegacy(args = [], timeoutMs = 90000) {
  return runScreener(args, timeoutMs).then(result => {
    // New format returns { json, exitCode, duration, stdout, stderr }
    if (result && result.json && Array.isArray(result.json.items)) {
      return result.json; // Return the JSON payload directly
    } else if (Array.isArray(result)) {
      // Handle legacy direct array result
      return { items: result };
    } else if (result && result.items) {
      return { items: result.items };
    } else {
      return { items: [] };
    }
  }).catch(error => {
    return { items: [], error: error.message };
  });
}

module.exports = { runScreener, runScreenerLegacy };