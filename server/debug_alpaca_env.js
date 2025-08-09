#!/usr/bin/env node
/**
 * Alpaca Environment Debug Script - For Deployed Environment Testing
 * Run this on the live deployment to diagnose 403 Forbidden errors
 */

const https = require('https');

function makeRequest(url, headers, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers, method }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: res.statusCode < 300 ? JSON.parse(data) : data
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
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function debugAlpacaEnvironment() {
  console.log('🔍 ALPACA ENVIRONMENT DEBUG SCRIPT');
  console.log('='.repeat(50));
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`🌍 Node Environment: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`🖥️  Platform: ${process.platform}`);
  console.log('='.repeat(50));
  
  // Step 1: Check environment variables
  console.log('\n1️⃣  ENVIRONMENT VARIABLES AUDIT:');
  
  const expectedVars = [
    'APCA_API_KEY_ID',
    'APCA_API_SECRET_KEY',
    'APCA_API_BASE_URL'
  ];
  
  const wrongVars = [
    'ALPACA_API_KEY',
    'ALPACA_SECRET_KEY',
    'ALPACA_BASE_URL'
  ];
  
  console.log('\n✅ Expected Variables (APCA_ prefix):');
  expectedVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`   • ${varName}: ✅ SET (${value.length} chars)`);
    } else {
      console.log(`   • ${varName}: ❌ NOT SET`);
    }
  });
  
  console.log('\n⚠️  Legacy Variables (ALPACA_ prefix - should NOT be used):');
  wrongVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`   • ${varName}: ⚠️  SET (${value.length} chars) - WRONG NAME!`);
    } else {
      console.log(`   • ${varName}: ✅ NOT SET (correct)`);
    }
  });
  
  // Step 2: Environment validation
  const apiKey = process.env.APCA_API_KEY_ID;
  const secretKey = process.env.APCA_API_SECRET_KEY;
  const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
  
  console.log('\n2️⃣  CONFIGURATION VALIDATION:');
  console.log(`   🔑 API Key: ${apiKey ? `✅ Present (${apiKey.length} chars)` : '❌ Missing'}`);
  console.log(`   🗝️  Secret Key: ${secretKey ? `✅ Present (${secretKey.length} chars)` : '❌ Missing'}`);
  console.log(`   🌐 Base URL: ${baseUrl}`);
  
  if (!apiKey || !secretKey) {
    console.log('\n❌ CRITICAL: Missing API credentials');
    console.log('🔧 Set APCA_API_KEY_ID and APCA_API_SECRET_KEY environment variables');
    return false;
  }
  
  // Step 3: Key format validation
  console.log('\n3️⃣  API KEY FORMAT VALIDATION:');
  
  // Alpaca key patterns
  const keyIdPattern = /^[A-Z0-9]{20}$/;  // 20 alphanumeric chars
  const secretPattern = /^[A-Za-z0-9+/=]{40}$/;  // Base64-like 40 chars
  
  const keyIdValid = keyIdPattern.test(apiKey);
  const secretValid = secretPattern.test(secretKey);
  
  console.log(`   📋 Key ID format: ${keyIdValid ? '✅ Valid pattern' : '❌ Invalid pattern'}`);
  console.log(`   📋 Secret format: ${secretValid ? '✅ Valid pattern' : '❌ Invalid pattern'}`);
  
  if (!keyIdValid || !secretValid) {
    console.log('⚠️  Warning: API key format may be incorrect');
  }
  
  // Step 4: Environment detection
  console.log('\n4️⃣  ENVIRONMENT DETECTION:');
  const isPaperUrl = baseUrl.includes('paper-api');
  const isLiveUrl = baseUrl.includes('api.alpaca.markets') && !baseUrl.includes('paper');
  
  console.log(`   📊 Using Paper Trading: ${isPaperUrl ? '✅ Yes' : '❌ No'}`);
  console.log(`   💰 Using Live Trading: ${isLiveUrl ? '✅ Yes' : '❌ No'}`);
  console.log(`   🔗 Full URL: ${baseUrl}`);
  
  // Step 5: Test API calls
  console.log('\n5️⃣  API CONNECTION TESTS:');
  
  const headers = {
    'APCA-API-KEY-ID': apiKey,
    'APCA-API-SECRET-KEY': secretKey,
    'accept': 'application/json'
  };
  
  // Test 1: Account endpoint
  console.log('\n📊 Testing /v2/account endpoint...');
  try {
    const accountResult = await makeRequest(`${baseUrl}/v2/account`, headers);
    
    console.log(`   Status: ${accountResult.status}`);
    
    if (accountResult.status === 200) {
      console.log('   ✅ SUCCESS: Account endpoint working');
      console.log(`   📈 Account ID: ${accountResult.data.id || 'unknown'}`);
      console.log(`   💰 Buying Power: $${accountResult.data.buying_power || '0'}`);
      console.log(`   🏛️  Account Status: ${accountResult.data.account_status || 'unknown'}`);
      console.log(`   📊 Trading Blocked: ${accountResult.data.trading_blocked || 'unknown'}`);
    } else if (accountResult.status === 401) {
      console.log('   ❌ AUTHENTICATION FAILED (401)');
      console.log('   🔧 API keys are invalid or expired');
      console.log(`   📝 Response: ${accountResult.data}`);
    } else if (accountResult.status === 403) {
      console.log('   ❌ AUTHORIZATION FAILED (403)');
      console.log('   🔧 API keys may be valid but lack permissions');
      console.log('   🔧 Check if paper trading is enabled for your account');
      console.log(`   📝 Response: ${accountResult.data}`);
    } else {
      console.log(`   ❌ UNEXPECTED ERROR: ${accountResult.status}`);
      console.log(`   📝 Response: ${accountResult.data}`);
    }
  } catch (error) {
    console.log(`   ❌ CONNECTION ERROR: ${error.message}`);
  }
  
  // Test 2: Positions endpoint
  console.log('\n📈 Testing /v2/positions endpoint...');
  try {
    const positionsResult = await makeRequest(`${baseUrl}/v2/positions`, headers);
    
    console.log(`   Status: ${positionsResult.status}`);
    
    if (positionsResult.status === 200) {
      const positions = Array.isArray(positionsResult.data) ? positionsResult.data : [];
      console.log(`   ✅ SUCCESS: Positions endpoint working`);
      console.log(`   📊 Current positions: ${positions.length}`);
      if (positions.length > 0) {
        console.log('   📈 Sample positions:');
        positions.slice(0, 3).forEach(pos => {
          console.log(`      • ${pos.symbol}: ${pos.qty} shares @ $${pos.avg_cost || pos.current_price}`);
        });
      }
    } else {
      console.log(`   ❌ FAILED: Status ${positionsResult.status}`);
      console.log(`   📝 Response: ${positionsResult.data}`);
    }
  } catch (error) {
    console.log(`   ❌ CONNECTION ERROR: ${error.message}`);
  }
  
  // Step 6: Summary and recommendations
  console.log('\n' + '='.repeat(50));
  console.log('🎯 DIAGNOSIS SUMMARY:');
  console.log('='.repeat(50));
  
  if (!apiKey || !secretKey) {
    console.log('❌ CRITICAL: Missing API credentials');
    console.log('🔧 Action: Set APCA_API_KEY_ID and APCA_API_SECRET_KEY');
  } else if (!keyIdValid || !secretValid) {
    console.log('⚠️  WARNING: API key format issues detected');
    console.log('🔧 Action: Verify API keys are correctly copied from Alpaca');
  } else {
    console.log('✅ Environment variables correctly configured');
    console.log('🔧 If still getting 403 errors, check:');
    console.log('   • Paper trading is enabled in your Alpaca account');
    console.log('   • API keys have correct permissions');
    console.log('   • Account is not restricted or suspended');
  }
  
  console.log('='.repeat(50));
  return true;
}

// Run the debug script
if (require.main === module) {
  debugAlpacaEnvironment().catch(console.error);
}

module.exports = { debugAlpacaEnvironment };