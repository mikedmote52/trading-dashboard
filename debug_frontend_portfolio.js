#!/usr/bin/env node
/**
 * Frontend Portfolio Debug Script
 * Compares local vs live deployment portfolio data
 */

const https = require('https');
const http = require('http');

console.log('🔍 Portfolio Frontend Debug Analysis');
console.log('=====================================\n');

// Test both local and live deployments
const tests = [
  {
    name: 'Local Development',
    url: 'http://localhost:3001/api/dashboard',
    protocol: http
  },
  {
    name: 'Live Deployment (Render)',  
    url: 'https://trading-dashboard-dvou.onrender.com/api/dashboard',
    protocol: https
  }
];

async function testEndpoint(test) {
  return new Promise((resolve) => {
    console.log(`📡 Testing ${test.name}:`);
    
    const url = new URL(test.url);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET'
    };

    const req = test.protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const portfolio = parsed.portfolio || {};
          
          const result = {
            success: true,
            url: test.url,
            status: res.statusCode,
            isConnected: portfolio.isConnected || false,
            positionsCount: (portfolio.positions || []).length,
            totalValue: portfolio.totalValue || 0,
            dailyPnL: portfolio.dailyPnL || 0,
            hasPositions: (portfolio.positions || []).length > 0,
            firstPosition: (portfolio.positions || [])[0] || null
          };
          
          console.log(`✅ Status: ${res.statusCode}`);
          console.log(`🔗 Connected: ${result.isConnected}`);
          console.log(`📊 Positions: ${result.positionsCount}`);
          console.log(`💰 Total Value: $${result.totalValue}`);
          console.log(`📈 Daily P&L: $${result.dailyPnL}`);
          
          if (result.firstPosition) {
            console.log(`🎯 Sample Position: ${result.firstPosition.symbol} - $${result.firstPosition.marketValue}`);
          }
          
          resolve(result);
        } catch (e) {
          console.log(`❌ JSON Parse Error: ${e.message}`);
          resolve({
            success: false,
            error: e.message,
            rawData: data.substring(0, 200)
          });
        }
      });
    });

    req.on('error', (err) => {
      console.log(`❌ Request Error: ${err.message}`);
      resolve({
        success: false,
        error: err.message
      });
    });

    req.setTimeout(10000, () => {
      console.log(`❌ Request Timeout`);
      resolve({
        success: false,
        error: 'Request timeout'
      });
    });

    req.end();
  });
}

// Frontend Data Format Check
function analyzeDataFormat(results) {
  console.log('\n📋 Frontend Data Format Analysis:');
  console.log('=================================');
  
  results.forEach((result, i) => {
    const test = tests[i];
    console.log(`\n${test.name}:`);
    
    if (!result.success) {
      console.log(`  ❌ Failed: ${result.error}`);
      return;
    }
    
    // Check what the frontend expects vs what it gets
    const expectations = {
      'portfolio.isConnected': result.isConnected,
      'portfolio.positions (array)': result.hasPositions,
      'portfolio.positions.length': result.positionsCount,
      'portfolio.totalValue': result.totalValue > 0,
      'portfolio.dailyPnL': typeof result.dailyPnL === 'number'
    };
    
    Object.entries(expectations).forEach(([field, value]) => {
      const status = value ? '✅' : '❌';
      console.log(`  ${status} ${field}: ${value}`);
    });
  });
}

// Main debug execution
async function runDebug() {
  const results = [];
  
  for (const test of tests) {
    const result = await testEndpoint(test);
    results.push(result);
    console.log(''); // spacing
  }
  
  // Analysis
  analyzeDataFormat(results);
  
  // Issue diagnosis
  console.log('\n🔍 Issue Diagnosis:');
  console.log('==================');
  
  const local = results[0];
  const live = results[1];
  
  if (local.success && live.success) {
    if (local.isConnected && !live.isConnected) {
      console.log('🎯 ROOT CAUSE: Alpaca API credentials not configured on live deployment');
      console.log('   - Local: Connected ✅');
      console.log('   - Live: Not Connected ❌');
      console.log('');
      console.log('🛠️  SOLUTION:');
      console.log('   1. Check Render environment variables:');
      console.log('      - APCA_API_KEY_ID');
      console.log('      - APCA_API_SECRET_KEY');
      console.log('      - APCA_API_BASE_URL');
      console.log('   2. Verify variables are exactly named (not ALPACA_*)');
      console.log('   3. Restart Render service after adding variables');
    } else if (!local.isConnected && !live.isConnected) {
      console.log('🎯 ROOT CAUSE: Alpaca API credentials not configured anywhere');
      console.log('   - Check local .env file and Render environment variables');
    } else {
      console.log('✅ Both environments connected - frontend rendering issue');
      console.log('   - Check browser console for JavaScript errors');
      console.log('   - Verify frontend is calling correct API endpoint');
    }
  } else {
    console.log('❌ API endpoints not responding - check server status');
  }
  
  // Frontend debugging tips
  console.log('\n🌐 Frontend Debug Steps:');
  console.log('========================');
  console.log('1. Open browser developer tools (F12)');
  console.log('2. Go to Network tab');
  console.log('3. Refresh dashboard page');  
  console.log('4. Check if /api/dashboard request succeeds');
  console.log('5. Examine response data structure');
  console.log('6. Check Console tab for JavaScript errors');
  console.log('');
  console.log('Expected frontend check:');
  console.log('- renderPortfolioPositions() function should receive data.portfolio.positions array');
  console.log('- If array is empty, "No positions found..." message shows');
  console.log('- If isConnected=false, connection status should show disconnected');
}

// Execute debug
runDebug().catch(console.error);