const { runScreener } = require('../lib/runScreener.js');
const { saveScoresAtomically } = require('../server/services/sqliteScores.js');

(async () => {
  const raw = await runScreener(['--limit','40'], 60000);
  const items = normalize(raw);
  if (!items.length) { console.error('[seed] no items'); process.exit(2); }
  await saveScoresAtomically(items, { run_id:`seed_${Date.now()}`, engine:process.env.SELECT_ENGINE||'v1', universe:Number(process.env.UNIVERSE_TARGET||200), snapshot_ts:new Date().toISOString() });
  console.log(`[seed] wrote ${items.length} items`);
})().catch(e => { console.error('[seed] fail', e); process.exit(1); });

function normalize(raw){
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : (raw ? [raw] : []));
  return list.map(o => ({ ticker:o.ticker||o.symbol, price:Number(o.price??o.last??0), score:Number(o.score??o.vigl??0), thesis:o.thesis_tldr||o.thesis||'', engine:o.engine||process.env.SELECT_ENGINE||'v1', run_id:o.run_id, snapshot_ts:o.snapshot_ts }))
             .filter(x => x.ticker);
}