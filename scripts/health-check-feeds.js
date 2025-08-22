#!/usr/bin/env node

/**
 * Market Data Feeds Health Check
 * Verifies all data sources are accessible at startup
 */

const axios = require('axios');

// Health check configuration
const HEALTH_CHECKS = {
  alpaca: {
    name: 'Alpaca Market Data',
    test: async () => {
      const response = await axios.get('https://data.alpaca.markets/v2/stocks/AAPL/quotes/latest', {
        headers: { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY }
      });
      return response.status === 200 && response.data?.quote;
    }
  },
  
  polygon: {
    name: 'Polygon Aggregates',  
    test: async () => {
      const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/SPY/prev?apikey=${process.env.POLYGON_API_KEY}`);
      return response.status === 200 && response.data?.resultsCount > 0;
    }
  },
  
  universe: {
    name: 'Universe Provider',
    test: async () => {
      // Test local universe screener
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const p = spawn('python3', ['agents/universe_screener.py', '--limit', '1', '--json-out'], {
          timeout: 10000
        });
        let output = '';
        p.stdout.on('data', d => output += d.toString());
        p.on('close', (code) => {
          resolve(code === 0 && output.includes('ticker'));
        });
      });
    }
  }
};

async function runHealthChecks(strict = false) {
  console.log('🔍 Running market data health checks...');
  
  const results = {};
  let allPassed = true;
  
  for (const [key, check] of Object.entries(HEALTH_CHECKS)) {
    try {
      console.log(`  Testing ${check.name}...`);
      const start = Date.now();
      const passed = await check.test();
      const duration = Date.now() - start;
      
      results[key] = { 
        name: check.name, 
        status: passed ? 'healthy' : 'degraded', 
        duration: `${duration}ms` 
      };
      
      if (passed) {
        console.log(`  ✅ ${check.name} - ${duration}ms`);
      } else {
        console.log(`  ❌ ${check.name} - failed after ${duration}ms`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`  ❌ ${check.name} - error: ${error.message}`);
      results[key] = { 
        name: check.name, 
        status: 'error', 
        error: error.message 
      };
      allPassed = false;
    }
  }
  
  console.log('\n📊 Health Check Summary:');
  console.log(JSON.stringify(results, null, 2));
  
  if (allPassed) {
    console.log('✅ All data feeds healthy');
    process.exit(0);
  } else {
    console.log('❌ Some data feeds degraded');
    if (strict) {
      console.log('🚨 Strict mode: exiting due to failed checks');
      process.exit(1);
    } else {
      console.log('⚠️  Continuing with degraded feeds (set STRICT_STARTUP=true to exit)');
      process.exit(0);
    }
  }
}

// Run health checks
const strictMode = process.env.STRICT_STARTUP === 'true' || process.argv.includes('--strict');
runHealthChecks(strictMode).catch(error => {
  console.error('🚨 Health check failed:', error.message);
  process.exit(1);
});