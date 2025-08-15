#!/usr/bin/env node

// Debug Alpaca API connection
require('dotenv').config();

function makeAlpacaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const apiKey = process.env.APCA_API_KEY_ID;
    const secretKey = process.env.APCA_API_SECRET_KEY;
    const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
    
    console.log('📡 Alpaca API Configuration:');
    console.log('  API Key:', apiKey ? `${apiKey.slice(0, 8)}...` : 'MISSING');
    console.log('  Secret Key:', secretKey ? `${secretKey.slice(0, 8)}...` : 'MISSING');
    console.log('  Base URL:', baseUrl);
    console.log('  Endpoint:', endpoint);
    
    if (!apiKey || !secretKey) {
      console.error('❌ Missing API keys');
      resolve(null);
      return;
    }

    const url = new URL(baseUrl);
    const options = {
      hostname: url.hostname,
      path: `/v2/${endpoint}`,
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey
      }
    };
    
    console.log('🔗 Making request to:', `${url.protocol}//${url.hostname}${options.path}`);

    const req = https.request(options, (res) => {
      let data = '';
      console.log('📊 Response status:', res.statusCode);
      console.log('📋 Response headers:', res.headers);
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          console.log('📄 Raw response length:', data.length);
          console.log('📄 First 200 chars of response:', data.slice(0, 200));
          
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            console.error('❌ API Error:', parsed);
            resolve(null);
          } else {
            console.log('✅ Success! Data type:', typeof parsed, 'Array?', Array.isArray(parsed));
            if (Array.isArray(parsed)) {
              console.log('📊 Array length:', parsed.length);
              console.log('📋 First 3 items:', parsed.slice(0, 3));
            }
            resolve(parsed);
          }
        } catch (e) {
          console.error('❌ JSON Parse Error:', e.message);
          console.log('📄 Raw response:', data);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request Error:', err.message);
      resolve(null);
    });
    
    req.setTimeout(10000, () => {
      console.error('❌ Request Timeout');
      resolve(null);
    });
    
    req.end();
  });
}

async function testAlpacaAPI() {
  console.log('🧪 Testing Alpaca API connection...\n');
  
  const assets = await makeAlpacaRequest('assets?status=active&tradable=true');
  
  if (assets && Array.isArray(assets)) {
    console.log(`\n✅ Successfully fetched ${assets.length} assets from Alpaca`);
    
    // Apply our filtering logic
    const filtered = assets
      .filter(a => a.exchange === 'NASDAQ' || a.exchange === 'NYSE' || a.exchange === 'ARCA')
      .filter(a => a.symbol && !a.symbol.includes('.') && !a.symbol.includes('-'))
      .filter(a => a.symbol.length <= 5)
      .filter(a => a.tradable === true && a.status === 'active');
    
    console.log(`🔍 After filtering: ${filtered.length} tradeable stocks`);
    console.log('📋 Sample filtered symbols:', filtered.slice(0, 20).map(a => a.symbol).join(', '));
    
    // Show exchange breakdown
    const exchanges = {};
    filtered.forEach(a => {
      exchanges[a.exchange] = (exchanges[a.exchange] || 0) + 1;
    });
    console.log('📈 Exchange breakdown:', exchanges);
    
  } else {
    console.log('❌ Failed to fetch assets or invalid response format');
  }
}

testAlpacaAPI();