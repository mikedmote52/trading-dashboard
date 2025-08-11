#!/usr/bin/env node

// Squeeze pipeline diagnostics (Alpha-stack ready)
// Verifies fundamentals, liquidity, borrow, and FINRA proxy (via getWithContext)

const fs = require('fs');

// Providers
const fundamentalsProvider = require('./server/services/providers/fundamentals');
const liquidityProvider    = require('./server/services/providers/liquidity');
const borrowProvider       = require('./server/services/providers/borrow');
const shortInterestProvider= require('./server/services/providers/shortinterest');

// Use only active/live symbols for diagnostics.
// Keep a couple of large caps to sanity-check provider plumbing.
const TEST_SYMBOLS = ['UP', 'LIXT', 'AEVA', 'TSLA', 'AAPL'];

const REQUIRED_FIELDS = {
  short_interest_pct:     'shortinterest',
  days_to_cover:          'shortinterest',
  borrow_fee_pct:         'borrow',
  borrow_fee_trend_pp7d:  'borrow',
  float_shares:           'fundamentals',
  adv_30d_shares:         'liquidity',
};

async function testProvider(name, provider, symbols, fn = 'get') {
  console.log(`\n=== Testing ${name} Provider (${fn}) ===`);
  const results = { success: 0, null_response: 0, errors: 0, details: {} };

  for (const s of symbols) {
    try {
      const data = await provider[fn](s);
      if (data == null) {
        results.null_response++;
        results.details[s] = 'NULL_RESPONSE';
      } else {
        results.success++;
        results.details[s] = {
          status: 'SUCCESS',
          keys: Object.keys(data),
          data_preview: JSON.stringify(data).slice(0, 200) + '…',
        };
      }
    } catch (e) {
      results.errors++;
      results.details[s] = { status: 'ERROR', message: e.message };
    }
    await new Promise(r => setTimeout(r, 75));
  }

  console.log(`Results: ${results.success} success, ${results.null_response} null, ${results.errors} errors`);
  return results;
}

async function testShortInterestWithContext(symbols) {
  console.log('\n=== Testing ShortInterest Proxy (getWithContext) ===');
  const details = {};
  let success = 0, nulls = 0, errors = 0;

  for (const s of symbols) {
    try {
      const [f, l, b] = await Promise.all([
        fundamentalsProvider.get(s),
        liquidityProvider.get(s),
        borrowProvider.get(s),
      ]);

      const ctx = {
        adv_30d_shares: l?.adv_30d_shares,
        float_shares: f?.float_shares,
        borrow_fee_trend_pp7d: b?.borrow_fee_trend_pp7d,
        borrow_fee_pct: b?.borrow_fee_pct,
      };

      const res = await shortInterestProvider.getWithContext(s, ctx);

      if (res == null) {
        nulls++;
        details[s] = {
          status: 'NULL',
          ctx_missing: Object.entries(ctx)
            .filter(([,v]) => v == null)
            .map(([k]) => k),
        };
      } else {
        success++;
        details[s] = { status: 'SUCCESS', keys: Object.keys(res), data_preview: JSON.stringify(res).slice(0, 200) + '…' };
      }
    } catch (e) {
      errors++;
      details[s] = { status: 'ERROR', message: e.message };
    }
    await new Promise(r => setTimeout(r, 75));
  }

  console.log(`Results: ${success} success, ${nulls} null, ${errors} errors`);
  return { success, null_response: nulls, errors, details };
}

async function main() {
  console.log('=== PROVIDER DATA FLOW DIAGNOSTIC ===');
  console.log(`Testing with symbols: ${TEST_SYMBOLS.join(', ')}`);

  const diagnostics = {};

  // Core providers
  diagnostics.fundamentals = await testProvider('Fundamentals', fundamentalsProvider, TEST_SYMBOLS, 'get');
  diagnostics.liquidity    = await testProvider('Liquidity',    liquidityProvider,    TEST_SYMBOLS, 'get');
  diagnostics.borrow       = await testProvider('Borrow',       borrowProvider,       TEST_SYMBOLS, 'get');

  // Short interest via FINRA proxy with context from the three providers above
  diagnostics.shortinterest = await testShortInterestWithContext(TEST_SYMBOLS);

  console.log('\n=== ENRICHMENT DEPENDENCY ANALYSIS ===');
  const missing_deps = {};
  for (const symbol of TEST_SYMBOLS) {
    missing_deps[symbol] = {};
    for (const [field, prov] of Object.entries(REQUIRED_FIELDS)) {
      const d = diagnostics[prov]?.details?.[symbol];
      const ok = d && d !== 'NULL_RESPONSE' && d.status === 'SUCCESS';
      if (!ok) missing_deps[symbol][field] = `${prov}_missing`;
    }
  }

  console.log('\nMISSING DEPENDENCIES BY SYMBOL:');
  for (const [sym, deps] of Object.entries(missing_deps)) {
    const cnt = Object.keys(deps).length;
    if (cnt === 0) {
      console.log(`${sym}: ALL DEPENDENCIES AVAILABLE ✓`);
    } else {
      console.log(`${sym}: ${cnt} missing - ${Object.keys(deps).join(', ')}`);
    }
  }

  // Persist artifact
  fs.writeFileSync(
    'provider_diagnostics.json',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      test_symbols: TEST_SYMBOLS,
      required_fields: REQUIRED_FIELDS,
      provider_results: diagnostics,
      missing_dependencies: missing_deps,
    }, null, 2)
  );

  console.log('\nDetailed results saved to provider_diagnostics.json');
  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

if (require.main === module) {
  main().catch(err => { console.error('Diagnostic failed:', err); process.exit(1); });
}

module.exports = { main };