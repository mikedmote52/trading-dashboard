const Engine = require('./server/services/squeeze/engine');
const { loadConfig } = require('./server/services/squeeze/util/config');

async function testRealisticGates() {
  console.log('Testing gates with realistic market conditions...');
  
  // Create more realistic test data - smaller cap stocks with squeeze potential
  const testStocks = [
    {
      ticker: "SHORTME", // Mock small cap with squeeze setup
      _held: false,
      short_interest_pct: 45.5,  // High SI
      days_to_cover: 8.2,        // Good DTC
      float_shares: 80000000,    // Under 150M limit
      avg_dollar_liquidity_30d: 15000000, // Good liquidity
      borrow_fee_pct: 18,        // Above 15% min
      borrow_fee_trend_pp7d: 5,  // Rising borrow costs
      catalyst: {
        verified_in_window: false,
        date_valid: false,
        placeholder: true
      },
      technicals: {},
      freshness: { short_interest_age_days: 2 }
    },
    {
      ticker: "MIDCAP",
      _held: false,
      short_interest_pct: 32.1,
      days_to_cover: 12.5,
      float_shares: 120000000,   // Under limit
      avg_dollar_liquidity_30d: 8000000,
      borrow_fee_pct: 22,
      borrow_fee_trend_pp7d: 2,
      catalyst: {
        verified_in_window: false,
        date_valid: false,
        placeholder: true
      },
      technicals: {},
      freshness: { short_interest_age_days: 1 }
    }
  ];
  
  const cfg = loadConfig();
  const Gates = require('./server/services/squeeze/gates');
  const Scorer = require('./server/services/squeeze/scorer');
  const ActionMapper = require('./server/services/squeeze/action_mapper');
  
  const gates = new Gates(cfg);
  const scorer = new Scorer(cfg);  
  const mapper = new ActionMapper(cfg);
  
  console.log('Current gate thresholds:', JSON.stringify(cfg.thresholds, null, 2));
  
  const gateResult = gates.apply(testStocks);
  console.log(`\nGate results: ${gateResult.passed.length} passed, ${Object.keys(gateResult.drops).length} dropped`);
  
  if (gateResult.passed.length > 0) {
    console.log('\nPassed stocks:');
    for (const stock of gateResult.passed) {
      const { composite, subscores } = scorer.score(stock);
      const action = mapper.map(composite, stock.technicals);
      
      console.log(`${stock.ticker}:`);
      console.log(`  Score: ${composite.toFixed(1)} -> ${action}`);
      console.log(`  SI: ${stock.short_interest_pct}%, DTC: ${stock.days_to_cover}, Fee: ${stock.borrow_fee_pct}%`);
    }
  }
  
  if (Object.keys(gateResult.drops).length > 0) {
    console.log('\nDropped stocks:');
    for (const [ticker, reasons] of Object.entries(gateResult.drops)) {
      console.log(`${ticker}: ${reasons.join(', ')}`);
    }
  }
}

testRealisticGates().catch(console.error);