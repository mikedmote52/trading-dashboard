#!/usr/bin/env node
/**
 * Direct Alpaca API test from within Node.js environment
 * Tests if the issue is with environment variable loading or API calls
 */

const https = require('https');

console.log('🔍 DIRECT ALPACA API TEST FROM NODE.JS');
console.log('='.repeat(60));

// Show exact environment variables as Node sees them
console.log('\n📋 Environment Variables (as Node.js sees them):');
console.log('APCA_API_KEY_ID:', process.env.APCA_API_KEY_ID ? 
  `${process.env.APCA_API_KEY_ID.substring(0, 5)}...${process.env.APCA_API_KEY_ID.substring(15)}` : 'NOT SET');
console.log('APCA_API_SECRET_KEY:', process.env.APCA_API_SECRET_KEY ? '[SET]' : 'NOT SET');
console.log('APCA_API_BASE_URL:', process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets');

// Test direct API call
function testAlpacaDirect() {
  const apiKey = process.env.APCA_API_KEY_ID;
  const secretKey = process.env.APCA_API_SECRET_KEY;
  const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
  
  if (!apiKey || !secretKey) {
    console.error('❌ API credentials not found in environment!');
    return;
  }
  
  console.log('\n🔐 Testing with credentials:');
  console.log('API Key:', apiKey);
  console.log('Secret Key:', secretKey ? '[REDACTED]' : 'NOT SET');
  console.log('Base URL:', baseUrl);
  
  const url = new URL(baseUrl);
  const options = {
    hostname: url.hostname,
    path: '/v2/account',
    method: 'GET',
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey
    }
  };
  
  console.log('\n📡 Making request to:', `https://${options.hostname}${options.path}`);
  console.log('Headers being sent:');
  console.log('  APCA-API-KEY-ID:', apiKey);
  console.log('  APCA-API-SECRET-KEY:', '[REDACTED]');
  
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('\n📊 Response:');
      console.log('Status Code:', res.statusCode);
      console.log('Status Message:', res.statusMessage);
      
      if (res.statusCode === 200) {
        const account = JSON.parse(data);
        console.log('✅ SUCCESS! Account data retrieved:');
        console.log('  Portfolio Value: $' + account.portfolio_value);
        console.log('  Account Status:', account.status);
        console.log('  Buying Power: $' + account.buying_power);
      } else if (res.statusCode === 403) {
        console.log('❌ 403 FORBIDDEN - Authentication failed');
        console.log('Response body:', data);
        console.log('\n🔧 Possible issues:');
        console.log('1. Environment variables not loaded correctly');
        console.log('2. Process needs restart to pick up new env vars');
        console.log('3. Credentials have hidden characters or encoding issues');
      } else {
        console.log('❌ Unexpected status:', res.statusCode);
        console.log('Response:', data.substring(0, 200));
      }
    });
  });
  
  req.on('error', (err) => {
    console.error('❌ Request error:', err.message);
  });
  
  req.end();
}

// Run the test
testAlpacaDirect();

// Export for use as module
module.exports = { testAlpacaDirect };