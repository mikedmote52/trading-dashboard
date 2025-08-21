const { saveScoresAtomically } = require('../server/services/sqliteScores.js');

const mockData = {
  run_id: 'seed_' + Date.now(),
  snapshot_ts: new Date().toISOString(),
  items: [
    {ticker: 'AAPL', price: 195.50, score: 82, thesis: 'Strong momentum breakout', engine: 'v1'},
    {ticker: 'NVDA', price: 1150.25, score: 88, thesis: 'AI leader consolidation', engine: 'v1'},
    {ticker: 'TSLA', price: 410.20, score: 75, thesis: 'EV growth recovery', engine: 'v1'},
    {ticker: 'MSFT', price: 425.50, score: 79, thesis: 'Cloud expansion surge', engine: 'v1'},
    {ticker: 'PLTR', price: 65.30, score: 91, thesis: 'Data analytics breakout', engine: 'v1'},
    {ticker: 'AMD', price: 195.40, score: 84, thesis: 'Chip sector rotation', engine: 'v1'},
    {ticker: 'SOFI', price: 17.85, score: 77, thesis: 'Fintech momentum', engine: 'v1'},
    {ticker: 'RBLX', price: 52.30, score: 73, thesis: 'Gaming recovery', engine: 'v1'}
  ]
};

(async () => {
  const items = mockData.items.map(o => ({
    ticker: o.ticker,
    price: o.price,
    score: o.score,
    thesis: o.thesis,
    run_id: mockData.run_id,
    snapshot_ts: mockData.snapshot_ts
  }));
  
  await saveScoresAtomically(items, {
    run_id: mockData.run_id,
    engine: process.env.SELECT_ENGINE || 'v1',
    universe: Number(process.env.UNIVERSE_TARGET || 200),
    snapshot_ts: mockData.snapshot_ts
  });
  
  console.log(`[seed-quick] wrote ${items.length} items with run_id=${mockData.run_id}`);
})().catch(e => {
  console.error('[seed-quick] fail', e);
  process.exit(1);
});