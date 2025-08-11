const Engine = require('./server/services/squeeze/engine');
const Gates = require('./server/services/squeeze/gates');
const { loadConfig } = require('./server/services/squeeze/util/config');

async function debugGates() {
  console.log('Testing lenient gates configuration...');
  
  // Load the lenient config
  process.env.SQUEEZE_CONFIG_PATH = 'test_lenient_config.yml';
  const cfg = loadConfig();
  console.log('Config thresholds:', JSON.stringify(cfg.thresholds, null, 2));
  
  // Create test data that matches what we saw
  const testData = [
    {
      ticker: "TSLA",
      _held: false,
      short_interest_pct: 33.81,
      days_to_cover: 12.09,
      float_shares: 3225448889,
      avg_dollar_liquidity_30d: 28731029086,
      borrow_fee_pct: 14,
      borrow_fee_trend_pp7d: 8,
      catalyst: { verified_in_window: false }, // This is likely the issue
      freshness: { short_interest_age_days: 0 }
    },
    {
      ticker: "AAPL", 
      _held: false,
      short_interest_pct: 60.82,
      days_to_cover: 150.33,
      float_shares: 14935826000,
      avg_dollar_liquidity_30d: 12822119890,
      borrow_fee_pct: 10,
      borrow_fee_trend_pp7d: 7,
      catalyst: { verified_in_window: false },
      freshness: { short_interest_age_days: 0 }
    }
  ];
  
  const gates = new Gates(cfg);
  const result = gates.apply(testData);
  
  console.log('Gate results:');
  console.log('Passed:', result.passed.length);
  console.log('Drops:', JSON.stringify(result.drops, null, 2));
}

debugGates().catch(console.error);