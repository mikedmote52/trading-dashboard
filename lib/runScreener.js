const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BIN = process.env.SCREENER_BIN || 'python3';

function tmpFile(prefix='screener') {
  return path.join(os.tmpdir(), `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
}

async function runScreener(profileArgs = [], timeoutMs = 180000) {
  const screenerPath = 'agents/universe_screener.py';
  const args = [screenerPath, '--json-out', ...profileArgs];
  const outPath = tmpFile();

  return new Promise((resolve, reject) => {
    const p = spawn(BIN, args, { 
      env: { ...process.env, JSON_OUT_PATH: outPath },
      stdio: ['ignore','pipe','pipe'] 
    });
    
    let out = '', err = '';
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => { 
      err += d;
      process.stderr.write(d); // still show stderr for debugging
    });
    
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
    
    p.on('close', (code, signal) => {
      clearTimeout(timer);
      
      // Clean up temp file after reading
      const cleanup = () => {
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
      };

      // Prefer the clean JSON file
      try {
        if (fs.existsSync(outPath)) {
          const raw = fs.readFileSync(outPath, 'utf8');
          const result = JSON.parse(raw);
          cleanup();
          return resolve(result);
        }
      } catch (e) {
        // fall through to salvage
      }

      // Salvage markers from stdout if file failed
      const m = out.match(/__JSON_START__([\s\S]*?)__JSON_END__/);
      if (m) {
        try { 
          const result = JSON.parse(m[1]);
          cleanup();
          return resolve(result); 
        } catch {}
      }

      // Legacy fallback - try to parse stdout directly
      try {
        const parsed = parseRobust(out) ?? salvageJson(out);
        if (parsed) {
          cleanup();
          return resolve(parsed);
        }
      } catch {}

      const why = signal ? `terminated by ${signal}` : `exited code ${code}`;
      cleanup();
      reject(new Error(`Screener produced no valid JSON (${why})\nSTDERR:\n${err}\nSTDOUT(first 2k):\n${out.slice(0,2000)}`));
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
    if (Array.isArray(result)) {
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