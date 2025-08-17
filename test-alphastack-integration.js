#!/usr/bin/env node
/**
 * AlphaStack Screener Integration Test
 * Verifies the complete integration is working properly
 */

const http = require('http');
const path = require('path');

console.log('🧪 AlphaStack Screener Integration Test');
console.log('=' .repeat(50));

// Test configuration
const HOST = 'localhost';
const PORT = 3001;
const BASE_URL = `http://${HOST}:${PORT}`;

/**
 * Make HTTP request to test endpoint
 */
function testEndpoint(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AlphaStack-Test/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            data: parsed
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            data: responseData,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Run comprehensive integration tests
 */
async function runIntegrationTests() {
  const tests = [
    {
      name: 'Server Health Check',
      endpoint: '/api/health',
      expected: { statusCode: 200 }
    },
    {
      name: 'AlphaStack Top Candidates',
      endpoint: '/api/screener/top?limit=5',
      expected: { statusCode: 200, hasData: true }
    },
    {
      name: 'AlphaStack Statistics', 
      endpoint: '/api/screener/stats',
      expected: { statusCode: 200, hasStats: true }
    },
    {
      name: 'AlphaStack Candidates Filter',
      endpoint: '/api/screener/candidates?min_score=50&limit=10',
      expected: { statusCode: 200, hasData: true }
    },
    {
      name: 'Dashboard Main Page',
      endpoint: '/',
      expected: { statusCode: 200 }
    }
  ];

  console.log(`\n🔍 Running ${tests.length} integration tests...\n`);

  const results = [];

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      console.log(`   URL: ${BASE_URL}${test.endpoint}`);
      
      const result = await testEndpoint(test.endpoint);
      
      let status = '✅ PASS';
      let details = '';
      
      // Check status code
      if (test.expected.statusCode && result.statusCode !== test.expected.statusCode) {
        status = '❌ FAIL';
        details += `Expected status ${test.expected.statusCode}, got ${result.statusCode}. `;
      }
      
      // Check for data presence
      if (test.expected.hasData && (!result.data || !result.data.items || result.data.items.length === 0)) {
        status = '❌ FAIL';
        details += 'Expected data items, but none found. ';
      }
      
      // Check for stats presence
      if (test.expected.hasStats && (!result.data || !result.data.statistics)) {
        status = '❌ FAIL';  
        details += 'Expected statistics, but none found. ';
      }

      console.log(`   Status: ${status}`);
      if (details) console.log(`   Details: ${details}`);
      
      // Show sample data for successful API calls
      if (result.statusCode === 200 && result.data && typeof result.data === 'object') {
        if (result.data.items && result.data.items.length > 0) {
          console.log(`   Sample: ${result.data.items.length} items, first symbol: ${result.data.items[0].symbol}`);
        } else if (result.data.statistics) {
          console.log(`   Stats: ${result.data.statistics.total_candidates} total candidates`);
        }
      }
      
      console.log('');
      
      results.push({
        test: test.name,
        status: status === '✅ PASS',
        statusCode: result.statusCode,
        details: details || 'OK',
        endpoint: test.endpoint
      });
      
    } catch (error) {
      console.log(`   Status: ❌ ERROR`);
      console.log(`   Error: ${error.message}`);
      console.log('');
      
      results.push({
        test: test.name,
        status: false,
        error: error.message,
        endpoint: test.endpoint
      });
    }
  }

  // Summary
  console.log('📊 Test Results Summary');
  console.log('=' .repeat(30));
  
  const passed = results.filter(r => r.status).length;
  const failed = results.length - passed;
  
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.status).forEach(r => {
      console.log(`   - ${r.test}: ${r.details || r.error}`);
    });
  }
  
  console.log('\n🎯 AlphaStack Integration Status:');
  if (passed === results.length) {
    console.log('✅ ALL TESTS PASSED - AlphaStack Screener fully integrated!');
    console.log('\n🚀 Next Steps:');
    console.log('1. Visit http://localhost:3001 to see the AlphaStack screener');
    console.log('2. Click "Run Scan" to populate with fresh data');
    console.log('3. Use "Refresh Data" to reload screening results');
    console.log('4. Test the Buy $100 buttons for trade execution');
  } else {
    console.log('⚠️  Some tests failed - check server logs and database connectivity');
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Ensure server is running: npm start or node server.js');
    console.log('2. Check database exists: trading_dashboard.db');
    console.log('3. Verify API routes are loaded in server.js');
    console.log('4. Check browser console for JavaScript errors');
  }
  
  return passed === results.length;
}

/**
 * Test AlphaStack scan functionality
 */
async function testScreenerScan() {
  console.log('\n🚀 Testing AlphaStack Scan Functionality...');
  
  try {
    console.log('Triggering screener scan...');
    const scanResult = await testEndpoint('/api/screener/run', 'POST', { label: 'integration_test' });
    
    if (scanResult.statusCode === 200 && scanResult.data.ok) {
      console.log('✅ Scan triggered successfully');
      console.log(`   Message: ${scanResult.data.message}`);
      console.log(`   Candidates found: ${scanResult.data.candidates_found || 'Unknown'}`);
      
      // Wait a moment then check for results
      console.log('\nWaiting 3 seconds for scan to complete...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('Checking for new screening results...');
      const resultsCheck = await testEndpoint('/api/screener/top?limit=3');
      
      if (resultsCheck.statusCode === 200 && resultsCheck.data.items.length > 0) {
        console.log('✅ Screening results available');
        console.log(`   Found ${resultsCheck.data.items.length} candidates`);
        resultsCheck.data.items.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.symbol} - Score: ${item.score}, Price: $${item.price}`);
        });
      } else {
        console.log('⚠️  No screening results found after scan');
      }
      
    } else {
      console.log('❌ Scan failed');
      console.log(`   Status: ${scanResult.statusCode}`);
      console.log(`   Response: ${JSON.stringify(scanResult.data, null, 2)}`);
    }
    
  } catch (error) {
    console.log('❌ Scan test failed');
    console.log(`   Error: ${error.message}`);
  }
}

// Main execution
async function main() {
  console.log(`🔗 Testing AlphaStack integration at ${BASE_URL}`);
  console.log(`📅 ${new Date().toISOString()}`);
  
  try {
    // Run basic integration tests
    const allTestsPassed = await runIntegrationTests();
    
    // If basic tests pass, test scan functionality
    if (allTestsPassed) {
      await testScreenerScan();
    }
    
    console.log('\n✨ Integration test completed!');
    process.exit(allTestsPassed ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    process.exit(1);
  }
}

// Check if server is running first
console.log(`\n🔍 Checking if server is running at ${BASE_URL}...`);
testEndpoint('/api/health')
  .then(() => {
    console.log('✅ Server is running, starting integration tests...');
    main();
  })
  .catch((error) => {
    console.log('❌ Server not responding');
    console.log(`   Error: ${error.message}`);
    console.log('\n🚀 Please start the server first:');
    console.log('   cd /Users/michaelmote/Desktop/trading-dashboard');
    console.log('   node server.js');
    process.exit(1);
  });
