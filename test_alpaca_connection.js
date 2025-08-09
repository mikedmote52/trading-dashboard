#!/usr/bin/env node
/**
 * Test Alpaca API Connection with Environment Variable Validation
 */

const https = require('https');

// Environment variable validation
function validateEnvironment() {
  const required = [
    'APCA_API_KEY_ID',
    'APCA_API_SECRET_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required Alpaca environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    return false;
  }
  
  // Log masked confirmation
  console.log('✅ Environment variables found:');
  console.log(`  - APCA_API_KEY_ID: ${process.env.APCA_API_KEY_ID ? 'SET (' + process.env.APCA_API_KEY_ID.length + ' chars)' : 'MISSING'}`);
  console.log(`  - APCA_API_SECRET_KEY: ${process.env.APCA_API_SECRET_KEY ? 'SET (' + process.env.APCA_API_SECRET_KEY.length + ' chars)' : 'MISSING'}`);
  
  return true;
}

function makeRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: res.statusCode === 200 ? JSON.parse(data) : data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

async function testAlpacaConnection() {
  console.log('🔍 Testing Alpaca API Connection...\n');
  
  // Step 1: Validate environment
  if (!validateEnvironment()) {
    process.exit(1);
  }
  
  const apiKey = process.env.APCA_API_KEY_ID;
  const secretKey = process.env.APCA_API_SECRET_KEY;
  const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
  
  console.log(`\n🌐 Testing connection to: ${baseUrl}`);
  
  // Step 2: Test account endpoint
  console.log('\n📊 Testing /v2/account endpoint...');
  
  try {
    const accountResult = await makeRequest(`${baseUrl}/v2/account`, {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey,
      'accept': 'application/json'
    });
    
    console.log(`   Status: ${accountResult.status}`);
    
    if (accountResult.status === 200) {
      console.log('   ✅ Account endpoint SUCCESS');
      console.log(`   📈 Account ID: ${accountResult.data.id}`);
      console.log(`   💰 Buying Power: $${accountResult.data.buying_power}`);
      console.log(`   🏛️ Account Type: ${accountResult.data.account_type || 'Unknown'}`);
    } else if (accountResult.status === 401) {
      console.log('   ❌ AUTHENTICATION FAILED - Invalid API keys');
      console.log('   🔧 Check your APCA_API_KEY_ID and APCA_API_SECRET_KEY values');
    } else if (accountResult.status === 403) {
      console.log('   ❌ AUTHORIZATION FAILED - API keys valid but insufficient permissions');
    } else {
      console.log(`   ❌ Request failed: ${accountResult.data}`);
    }
    
  } catch (error) {
    console.log('   ❌ Connection error:', error.message);
  }
  
  // Step 3: Test clock endpoint
  console.log('\n🕐 Testing /v2/clock endpoint...');
  
  try {
    const clockResult = await makeRequest(`${baseUrl}/v2/clock`, {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey,
      'accept': 'application/json'
    });
    
    console.log(`   Status: ${clockResult.status}`);
    
    if (clockResult.status === 200) {
      console.log('   ✅ Clock endpoint SUCCESS');
      console.log(`   📅 Market time: ${clockResult.data.timestamp}`);
      console.log(`   🏪 Market open: ${clockResult.data.is_open}`);
    } else {
      console.log(`   ❌ Clock request failed: ${clockResult.data}`);
    }
    
  } catch (error) {
    console.log('   ❌ Clock connection error:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 ALPACA API CONNECTION TEST COMPLETE');
  console.log('='.repeat(60));
}

// Run the test
if (require.main === module) {
  testAlpacaConnection().catch(console.error);
}

module.exports = { testAlpacaConnection };