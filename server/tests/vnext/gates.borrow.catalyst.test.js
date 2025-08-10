const Gates = require('../../services/squeeze/gates');
const { loadConfig } = require('../../services/squeeze/util/config');

// Load configuration for tests
const cfg = loadConfig();

test('drops when borrow fee trend is not rising', () => {
  const g = new Gates(cfg);
  const row = {
    ticker: 'TEST',
    float_shares: 10_000_000,
    short_interest_pct: 40,
    days_to_cover: 9,
    borrow_fee_pct: 20,
    borrow_fee_trend_pp7d: -1,
    avg_dollar_liquidity_30d: 10_000_000,
    catalyst: { type: 'earnings', date_valid: true, days_to_event: 20 },
    freshness: { short_interest_age_days: 2 }
  };
  const { passed, drops } = g.apply([row]);
  expect(passed.length).toBe(0);
  expect(drops.TEST).toContain('borrow_fee_trend_not_rising');
});

test('drops when catalyst is missing or out of 14–30 day window', () => {
  const g = new Gates(cfg);
  const row = {
    ticker: 'TEST',
    float_shares: 10_000_000,
    short_interest_pct: 40,
    days_to_cover: 9,
    borrow_fee_pct: 20,
    borrow_fee_trend_pp7d: 2,
    avg_dollar_liquidity_30d: 10_000_000,
    catalyst: null,
    freshness: { short_interest_age_days: 2 }
  };
  const { passed, drops } = g.apply([row]);
  expect(passed.length).toBe(0);
  expect(drops.TEST).toContain('catalyst_invalid_or_out_of_window');
});

test('passes when all gate conditions are met', () => {
  const g = new Gates(cfg);
  const row = {
    ticker: 'TEST',
    float_shares: 50_000_000, // Under 150M limit
    short_interest_pct: 40,   // Above 30% min
    days_to_cover: 9,         // Above 7 min
    borrow_fee_pct: 20,       // Above 15% min
    borrow_fee_trend_pp7d: 3, // Rising trend
    avg_dollar_liquidity_30d: 10_000_000, // Above 5M min
    catalyst: { type: 'earnings', date_valid: true, days_to_event: 20 }, // In 14-30 day window
    freshness: { short_interest_age_days: 2 } // Fresh data
  };
  const { passed, drops } = g.apply([row]);
  expect(passed.length).toBe(1);
  expect(passed[0].ticker).toBe('TEST');
  expect(drops.TEST).toBeUndefined();
});