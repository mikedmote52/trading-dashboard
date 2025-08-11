const Engine = require('./server/services/squeeze/engine');
const Gates = require('./server/services/squeeze/gates');
const Scorer = require('./server/services/squeeze/scorer');
const ActionMapper = require('./server/services/squeeze/action_mapper');
const { loadConfig } = require('./server/services/squeeze/util/config');

async function testActionMapperDirectly() {
  console.log('Testing ActionMapper directly with mock data...');
  
  // Load config
  process.env.SQUEEZE_CONFIG_PATH = 'test_lenient_config.yml';
  const cfg = loadConfig();
  
  // Create test data that should pass gates (no catalyst requirement)
  const testData = [
    {
      ticker: "TSLA",
      _held: false,
      short_interest_pct: 33.81,
      days_to_cover: 12.09,
      float_shares: 150000000, // Under the limit
      avg_dollar_liquidity_30d: 28731029086,
      borrow_fee_pct: 14,
      borrow_fee_trend_pp7d: 8,
      catalyst: { 
        date_valid: true,
        days_to_event: 15,
        verified_in_window: true 
      },
      freshness: { short_interest_age_days: 0 },
      technicals: {}
    }
  ];
  
  // Test gates
  const gates = new Gates(cfg);
  const gateResult = gates.apply(testData);
  console.log('Gate result:', gateResult.passed.length, 'passed,', Object.keys(gateResult.drops).length, 'dropped');
  
  if (gateResult.passed.length > 0) {
    // Test scorer
    const scorer = new Scorer(cfg);
    const mapper = new ActionMapper(cfg);
    
    for (const stock of gateResult.passed) {
      const { composite, subscores, weights } = scorer.score(stock);
      const action = mapper.map(composite, stock.technicals);
      
      console.log(`${stock.ticker}:`);
      console.log(`  Composite Score: ${composite.toFixed(2)}`);
      console.log(`  Action: ${action}`);
      console.log(`  Subscores:`, subscores);
    }
  } else {
    console.log('Drops:', gateResult.drops);
  }
}

testActionMapperDirectly().catch(console.error);