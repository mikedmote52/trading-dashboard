#!/usr/bin/env node
const http = require('http');
const { spawnSync } = require('child_process');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => { 
      let d = ''; 
      r.on('data', c => d += c); 
      r.on('end', () => { 
        try {
          resolve(JSON.parse(d));
        } catch (e) { 
          reject(new Error('Bad JSON from ' + url + ': ' + d));
        }
      });
    }).on('error', reject);
  });
}

function post(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (r) => { 
      let d = ''; 
      r.on('data', c => d += c); 
      r.on('end', () => { 
        try {
          resolve(JSON.parse(d));
        } catch (e) { 
          reject(new Error('Bad JSON from ' + url + ': ' + d));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const dbg = await get('http://localhost:3001/api/discoveries/_debug/engine');
    if (!dbg.success) throw new Error('Debug endpoint not ok');
    const apiEngine = dbg.active_engine;

    const cli = spawnSync(process.execPath, ['scripts/scan_once.js'], {
      env: { ...process.env, SELECT_ENGINE: apiEngine },
      encoding: 'utf8'
    });
    if (cli.status !== 0) throw new Error('CLI failed: ' + (cli.stderr || ''));
    const cliJson = JSON.parse(cli.stdout);

    const scan = await post('http://localhost:3001/api/discoveries/scan');

    const ok =
      scan.success === true &&
      cliJson.engine === apiEngine &&
      scan.engine === apiEngine &&
      Array.isArray(scan.discoveries);

    if (!ok) {
      console.error({ 
        apiEngine, 
        cliEngine: cliJson.engine, 
        apiScanEngine: scan.engine, 
        discoveriesType: typeof scan.discoveries 
      });
      throw new Error('Engines mismatch or payload invalid');
    }

    console.log('✅ E2E PASS | engine=', apiEngine, '| CLI count=', cliJson.count, '| API count=', scan.discoveries.length);
    process.exit(0);
  } catch (e) {
    console.error('❌ E2E FAIL:', e.message);
    process.exit(1);
  }
})();