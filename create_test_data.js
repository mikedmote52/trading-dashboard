const db = require('./server/db/sqlite');

// Create test discovery with proper action
const testDiscovery = {
  symbol: 'TESTVIGL',
  price: 15.50,
  score: 75.5,
  action: 'WATCHLIST', 
  features_json: JSON.stringify({
    short_interest_pct: 45.2,
    days_to_cover: 12.5,
    borrow_fee_pct: 25.0,
    avg_dollar_liquidity_30d: 15000000,
    technicals: {
      rel_volume: 3.2,
      price: 15.50
    },
    catalyst: {
      type: 'earnings',
      verified_in_window: true,
      days_to_event: 5
    }
  }),
  audit_json: JSON.stringify({
    subscores: { siSub: 90, dtcSub: 85, feeSub: 80, cat: 70, liqSub: 75, techSub: 65 },
    weights: { squeeze: 0.55, catalyst: 0.25, liquidity: 0.1, technicals: 0.1 },
    gates: { data_ready: true, float_max: true, adv_min: true, si_min: true, dtc_min: true, borrow_min: true },
    freshness: { short_interest_age_days: 1 }
  }),
  created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
};

console.log('Inserting test discovery with WATCHLIST action...');

const stmt = db.db.prepare(`
  INSERT INTO discoveries (
    symbol, price, score, action, features_json, audit_json, created_at, preset
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

stmt.run(
  testDiscovery.symbol,
  testDiscovery.price, 
  testDiscovery.score,
  testDiscovery.action,
  testDiscovery.features_json,
  testDiscovery.audit_json,
  testDiscovery.created_at,
  'test_preset'
);

console.log('✅ Test discovery inserted successfully');

// Verify
const check = db.db.prepare('SELECT symbol, action, score FROM discoveries WHERE symbol = ?').get('TESTVIGL');
console.log('Verification:', check);