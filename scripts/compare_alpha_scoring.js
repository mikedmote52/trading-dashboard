#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function getEngineInstance() {
  const Mod = require('../server/services/squeeze/engine');
  if (typeof Mod === 'function') return new Mod();
  if (Mod && typeof Mod.default === 'function') return new Mod.default();
  return Mod; // if it already exports an instance with run()
}

async function main() {
  const engine = await getEngineInstance();
  if (!engine || typeof engine.run !== 'function') {
    throw new Error('engine.run() not found');
  }

  // engine.run() should honor ENGINE_TEST_SYMBOLS that you're exporting
  const result = await engine.run();

  // expect result.candidates or similar; fall back to any array of rows with score
  const rows = Array.isArray(result?.candidates) ? result.candidates
             : Array.isArray(result) ? result
             : Array.isArray(result?.passed) ? result.passed
             : [];

  // Debug gate failures when no candidates pass
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No candidates passed. Gate reasons by symbol:');
    const diagnostics = result.all_diagnostics || [];
    for (const c of diagnostics) {
      console.log(
        c.ticker,
        { 
          float: c.float_shares,
          adv: c.adv_30d_shares,
          si: c.short_interest_pct,
          dtc: c.days_to_cover,
          borrow: c.borrow_fee_pct 
        },
        c.gate_failures || 'no_failures_recorded'
      );
    }
  }

  // sort and serialize a stable artifact
  rows.sort((a,b) => (b.score ?? 0) - (a.score ?? 0));

  const out = {
    timestamp: new Date().toISOString(),
    explain: rows.map(r => ({
      symbol: r.symbol || r.ticker,
      score: r.score ?? null,
      score_explain: r.score_explain || {},
    }))
  };

  fs.writeFileSync(path.join(__dirname, '..', 'compare_alpha_scoring.json'), JSON.stringify(out, null, 2));
  console.table(out.explain.map(e => ({ symbol: e.symbol, score: e.score })));
  console.log('Wrote compare_alpha_scoring.json');
}

main().catch(err => { console.error(err); process.exit(1); });