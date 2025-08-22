import { spawn } from 'node:child_process';
const BIN = process.env.SCREENER_BIN || 'python3';

export type ScreenerOut = { run_id?: string; snapshot_ts?: string; items?: any[] } | any[];

export async function runScreener(profileArgs: string[] = [], timeoutMs: number = 180000): Promise<ScreenerOut> {
  const screenerPath = 'agents/universe_screener.py';
  const args = [screenerPath, '--json-out', ...profileArgs];

  let out = '', timedOut = false;
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, args, { env: process.env, stdio: ['ignore','pipe','pipe'] });
    const to = setTimeout(() => { timedOut = true; try { p.kill('SIGTERM'); } catch {} }, timeoutMs);
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => process.stderr.write(d));
    p.on('error', reject);
    p.on('close', () => {
      clearTimeout(to);
      try {
        const parsed = parseRobust(out) ?? salvageJson(out);
        if (!parsed) throw new Error('no JSON found');
        if (timedOut) console.warn('[runScreener] timeout but salvaged valid JSON');
        resolve(parsed);
      } catch (e:any) {
        const head = (out||'').slice(0,200).replace(/\s+/g,' ');
        reject(new Error(`parse error: ${e.message}; stdout_head=${head}`));
      }
    });
  });
}

function parseRobust(s0:string){ const s=(s0||'').trim(); if(!s) return null;
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try { return JSON.parse(s); } catch {}
  }
  const lines = s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); const arr:any[]=[];
  for (const ln of lines){ const o=extractLastJson(ln); if(o) arr.push(o); }
  if (arr.length) return arr;
  const last = extractLastJson(s); if (last) return Array.isArray(last)? last : { items: last.items ?? [] };
  return null;
}
function extractLastJson(s:string){ const a=s.lastIndexOf('{'); const b=s.lastIndexOf('}');
  if (a>=0 && b>a){ try { return JSON.parse(s.slice(a,b+1)); } catch {} } return null; }
function salvageJson(s0:string){ const s=(s0||'').trim(); if(!s) return null;
  let depth=0,start=-1,end=-1; for(let i=0;i<s.length;i++){ const c=s[i];
    if(c==='{'){ if(depth===0) start=i; depth++; } else if(c==='}'){ depth--; if(depth===0) end=i; } }
  if(start>=0 && end>start){ try { return JSON.parse(s.slice(start,end+1)); } catch {} } return null;
}

// Legacy interface compatibility
export interface ScreenerResult {
  items: any[];
  error?: string;
  stderr?: string;
  stdout?: string;
}

// Legacy function wrapper for compatibility
export function runScreenerLegacy(args: string[] = [], timeoutMs: number = 90000): Promise<ScreenerResult> {
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