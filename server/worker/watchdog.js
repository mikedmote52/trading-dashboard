const { runScreener } = require('../../lib/runScreener');
const { getProfile } = require('../../lib/screenerProfile');
const { saveScoresAtomically } = require('../services/sqliteScores');
const sqlite3 = require('sqlite3');
const path = require('path');

async function lastSnapshotAgeMs() {
  const dbPath = path.join(process.cwd(), 'trading_dashboard.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT MAX(updated_at) as last_update FROM latest_scores',
      (err, row) => {
        db.close();
        if (err) reject(err);
        else {
          const lastUpdate = row?.last_update ? new Date(row.last_update).getTime() : 0;
          resolve(Date.now() - lastUpdate);
        }
      }
    );
  });
}

function normalize(raw) {
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : (raw ? [raw] : []));
  return list.map(o => ({
    ticker: o.ticker || o.symbol,
    price: Number(o.price ?? o.last ?? 0),
    score: Number(o.score ?? o.vigl ?? 0),
    thesis: o.thesis_tldr || o.thesis || '',
    run_id: o.run_id,
    snapshot_ts: o.snapshot_ts
  })).filter(x => x.ticker);
}

async function startWatchdog() {
  console.log('🔍 Starting discovery watchdog...');
  
  setInterval(async () => {
    try {
      const age = await lastSnapshotAgeMs();
      console.log(`[watchdog] 💗 heartbeat: snapshot_age=${Math.round(age/60000)}m`);
      
      if (age > 5 * 60 * 1000) { // stale > 5 minutes
        console.log(`⚠️ Snapshot stale (${Math.round(age/60000)}m), seeding...`);
        const { args } = getProfile();
        const raw = await runScreener(['--limit', '40', ...args], 60000);
        const items = normalize(raw);
        
        if (items.length) {
          await saveScoresAtomically(items, {
            run_id: `seed_${Date.now()}`,
            engine: process.env.SELECT_ENGINE || 'optimized',
            universe: 400,
            snapshot_ts: new Date().toISOString()
          });
          console.log(`✅ Watchdog seeded ${items.length} items`);
        }
      } else {
        console.log(`[watchdog] ✅ snapshot fresh (${Math.round(age/60000)}m old)`);
      }
    } catch (e) {
      console.warn('[watchdog] seed fail', e?.message || e);
    }
  }, 120000); // every 2 minutes
}

function getWatchdogState() {
  return { running: true, interval_ms: 120000 };
}

module.exports = {
  startWatchdog,
  getWatchdogState,
  lastSnapshotAgeMs
};