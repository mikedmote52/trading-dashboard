#!/usr/bin/env node
/**
 * Debug Alpaca 403 Forbidden Errors on Render
 * Diagnoses environment variable retrieval and API request issues
 */

const https = require('https');

async function debugAlpaca403() {
  console.log('🔍 ALPACA 403 ERROR DIAGNOSIS');
  console.log('='.repeat(60));
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🖥️  Platform: ${process.platform}`);
  console.log('='.repeat(60));

  // 1. EXACT ENVIRONMENT VARIABLE RETRIEVAL
  console.log('\n1️⃣  EXACT ENVIRONMENT VARIABLE VALUES (as retrieved):');
  console.log('-'.repeat(60));
  
  const apiKey = process.env.APCA_API_KEY_ID;
  const secretKey = process.env.APCA_API_SECRET_KEY;
  const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
  
  console.log('APCA_API_KEY_ID:');
  console.log(`  Raw value: "${apiKey}"`);
  console.log(`  Length: ${apiKey ? apiKey.length : 0}`);
  console.log(`  First 5 chars: "${apiKey ? apiKey.substring(0, 5) : 'N/A'}..."`);
  console.log(`  Last 5 chars: "...${apiKey ? apiKey.substring(apiKey.length - 5) : 'N/A'}"`);
  console.log(`  Has whitespace: ${apiKey ? /\s/.test(apiKey) : 'N/A'}`);
  console.log(`  Has special chars: ${apiKey ? /[^\w-]/.test(apiKey) : 'N/A'}`);
  
  console.log('\nAPCA_API_SECRET_KEY:');
  console.log(`  Raw value: "${secretKey ? '[REDACTED]' : 'NOT SET'}"`);
  console.log(`  Length: ${secretKey ? secretKey.length : 0}`);
  console.log(`  First 5 chars: "${secretKey ? secretKey.substring(0, 5) : 'N/A'}..."`);
  console.log(`  Last 5 chars: "...${secretKey ? secretKey.substring(secretKey.length - 5) : 'N/A'}"`);
  console.log(`  Has whitespace: ${secretKey ? /\s/.test(secretKey) : 'N/A'}`);
  console.log(`  Has special chars: ${secretKey ? /[^\w+/=]/.test(secretKey) : 'N/A'}`);
  
  console.log('\nAPCA_API_BASE_URL:');
  console.log(`  Value: "${baseUrl}"`);
  console.log(`  Is paper URL: ${baseUrl.includes('paper-api')}`);
  console.log(`  Is live URL: ${baseUrl.includes('api.alpaca') && !baseUrl.includes('paper')}`);

  // 2. TEST WITH EXACT HEADERS
  console.log('\n2️⃣  TESTING API WITH EXACT HEADERS:');
  console.log('-'.repeat(60));
  
  // Test account endpoint
  const accountResult = await testEndpoint('/v2/account', apiKey, secretKey, baseUrl);
  console.log('\n📊 Account Endpoint:');
  console.log(`  Status: ${accountResult.status}`);
  console.log(`  Headers sent:`);
  console.log(`    APCA-API-KEY-ID: "${apiKey ? apiKey.substring(0, 5) + '...' : 'NOT SET'}"`);
  console.log(`    APCA-API-SECRET-KEY: "${secretKey ? '[REDACTED]' : 'NOT SET'}"`);
  if (accountResult.status === 403) {
    console.log(`  ❌ 403 FORBIDDEN - Authentication rejected`);
    console.log(`  Response: ${accountResult.body}`);
  } else if (accountResult.status === 200) {
    console.log(`  ✅ SUCCESS - Authentication accepted`);
  }
  
  // Test positions endpoint
  const positionsResult = await testEndpoint('/v2/positions', apiKey, secretKey, baseUrl);
  console.log('\n📈 Positions Endpoint:');
  console.log(`  Status: ${positionsResult.status}`);
  if (positionsResult.status === 403) {
    console.log(`  ❌ 403 FORBIDDEN - Authentication rejected`);
  } else if (positionsResult.status === 200) {
    console.log(`  ✅ SUCCESS - ${JSON.parse(positionsResult.body).length || 0} positions found`);
  }

  // 3. COMPARE WITH WORKING LOCAL CONFIG
  console.log('\n3️⃣  COMPARISON WITH WORKING LOCAL CONFIG:');
  console.log('-'.repeat(60));
  
  // Check if the keys match what we expect
  const expectedKeyStart = 'PKX1W';
  const expectedKeyEnd = 'LBAR8';
  const actualKeyStart = apiKey ? apiKey.substring(0, 5) : '';
  const actualKeyEnd = apiKey ? apiKey.substring(apiKey.length - 5) : '';
  
  console.log(`Expected API Key pattern: ${expectedKeyStart}...${expectedKeyEnd}`);
  console.log(`Actual API Key pattern: ${actualKeyStart}...${actualKeyEnd}`);
  console.log(`Keys match expected: ${actualKeyStart === expectedKeyStart && actualKeyEnd === expectedKeyEnd ? '✅' : '❌'}`);

  // 4. ENVIRONMENT VARIABLE INJECTION CHECK
  console.log('\n4️⃣  ENVIRONMENT VARIABLE INJECTION CHECK:');
  console.log('-'.repeat(60));
  
  // Check for common injection issues
  const injectionTests = [
    { name: 'Leading/trailing whitespace', test: apiKey && (apiKey !== apiKey.trim()) },
    { name: 'Newline characters', test: apiKey && apiKey.includes('\n') },
    { name: 'Carriage return', test: apiKey && apiKey.includes('\r') },
    { name: 'Tab characters', test: apiKey && apiKey.includes('\t') },
    { name: 'Quotes in value', test: apiKey && (apiKey.includes('"') || apiKey.includes("'")) },
    { name: 'Escape sequences', test: apiKey && apiKey.includes('\\') }
  ];
  
  injectionTests.forEach(test => {
    console.log(`  ${test.name}: ${test.test ? '⚠️ DETECTED' : '✅ Clean'}`);
  });

  // 5. DIAGNOSTIC SUMMARY
  console.log('\n5️⃣  DIAGNOSTIC SUMMARY:');
  console.log('='.repeat(60));
  
  if (accountResult.status === 403) {
    console.log('❌ API AUTHENTICATION FAILING');
    console.log('\nPossible causes:');
    console.log('1. Environment variables have whitespace or special characters');
    console.log('2. Keys are for different environment (live vs paper)');
    console.log('3. Keys have been revoked or regenerated');
    console.log('4. Paper trading not enabled on account');
    console.log('5. Render is modifying environment variables during injection');
    
    console.log('\n🔧 RECOMMENDED FIXES:');
    console.log('1. Re-copy API keys without any whitespace');
    console.log('2. Verify keys work with: curl -H "APCA-API-KEY-ID: <key>" -H "APCA-API-SECRET-KEY: <secret>" https://paper-api.alpaca.markets/v2/account');
    console.log('3. Check Alpaca dashboard for paper trading status');
    console.log('4. Consider regenerating API keys and updating Render');
    console.log('5. Try wrapping values in quotes in Render UI if not already');
  } else {
    console.log('✅ API AUTHENTICATION WORKING');
  }
  
  return accountResult.status !== 403;
}

// Helper function to test endpoint
function testEndpoint(path, apiKey, secretKey, baseUrl) {
  return new Promise((resolve) => {
    const url = new URL(baseUrl);
    const options = {
      hostname: url.hostname,
      path: path,
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data.substring(0, 200)
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({
        status: 0,
        error: err.message
      });
    });
    
    req.setTimeout(5000);
    req.end();
  });
}

// Export for use in other scripts
module.exports = { debugAlpaca403 };

// Run if called directly
if (require.main === module) {
  debugAlpaca403()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}