// scripts/engine_watchdog.js
const API = process.env.API_URL || 'https://trading-dashboard-dvou.onrender.com';
const SLEEP_MS = +(process.env.WATCHDOG_INTERVAL_MS || 120000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function j(url, init) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body };
  } finally { clearTimeout(to); }
}

async function tick() {
  const who = await j(`${API}/api/whoami`);
  if (!who.ok) { console.error('whoami failed', who.status, who.body); return; }

  const run = await j(`${API}/api/discoveries/run`, { method: 'POST' });
  const job = run.body?.job;
  if (!job) { console.error('run missing job id', run.body); return; }

  await sleep(3000);
  const stat = await j(`${API}/api/discoveries/run/${job}`);
  const latest = await j(`${API}/api/discoveries/latest`);
  console.log(JSON.stringify({
    t: new Date().toISOString(),
    job, status: stat.body?.job?.status, candidates: stat.body?.job?.candidates ?? 0,
    latest_count: Array.isArray(latest.body?.discoveries) ? latest.body.discoveries.length : null
  }));
}

(async () => { for (;;) { try { await tick(); } catch (e) { console.error('tick error', e.message); } await sleep(SLEEP_MS); }})();