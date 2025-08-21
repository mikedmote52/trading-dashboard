#!/usr/bin/env node

const http = require('http');
const https = require('https');

const BASE_URL = process.env.VERIFY_URL || 'http://localhost:3003';

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Request timeout')));
  });
}

async function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const postData = JSON.stringify(payload);
    
    const options = new URL(url);
    options.method = 'POST';
    options.headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Request timeout')));
    req.write(postData);
    req.end();
  });
}

async function verifyEndpoint(name, url, expectedStatus = 200) {
  try {
    console.log(`🔍 Testing ${name}: ${url}`);
    const response = await httpGet(url);
    
    if (response.status === expectedStatus) {
      console.log(`✅ ${name}: OK (${response.status})`);
      return true;
    } else {
      console.log(`❌ ${name}: Expected ${expectedStatus}, got ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name}: Error - ${error.message}`);
    return false;
  }
}

async function verifyPortfolioPageServes() {
  try {
    console.log(`🔍 Testing Portfolio page serves HTML`);
    const response = await httpGet(`${BASE_URL}/portfolio`);
    
    if (response.status === 200 && (response.body.includes('portfolio-lpi-v2') || response.body.includes('Portfolio LPI v2'))) {
      console.log(`✅ Portfolio page: OK (serves HTML)`);
      return true;
    } else {
      console.log(`❌ Portfolio page: Expected HTML with 'portfolio-lpi-v2', got status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Portfolio page: Error - ${error.message}`);
    return false;
  }
}

async function verifyDiscoveryContenders() {
  try {
    console.log(`🔍 Testing Discovery contenders API`);
    const response = await httpGet(`${BASE_URL}/api/discovery/contenders?limit=3`);
    
    if (response.status === 200) {
      const data = JSON.parse(response.body);
      if (data.success && Array.isArray(data.items)) {
        console.log(`✅ Discovery contenders: OK (${data.items.length} items)`);
        return true;
      } else {
        console.log(`❌ Discovery contenders: Invalid response format`);
        return false;
      }
    } else {
      console.log(`❌ Discovery contenders: Expected 200, got ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Discovery contenders: Error - ${error.message}`);
    return false;
  }
}

async function verifyCreateOrderLink() {
  try {
    console.log(`🔍 Testing Create order link`);
    const payload = {
      ticker: 'TEST',
      usd: 100,
      tp1_pct: 0.15,
      tp2_pct: 0.30,
      sl_pct: 0.08,
      price: 50.00,
      engine: 'alphastack',
      run_id: 'test_run_123'
    };

    const response = await httpPost(`${BASE_URL}/api/order`, payload);
    
    // Accept both success and expected failures (like missing Alpaca creds)
    if (response.status >= 200 && response.status < 500) {
      const data = JSON.parse(response.body);
      if (data.ok || data.error) {
        console.log(`✅ Create order: OK (${response.status}) - ${data.ok ? 'Success' : 'Expected error: ' + data.error}`);
        return true;
      }
    }
    
    console.log(`❌ Create order: Unexpected response ${response.status}`);
    console.log(`Response: ${response.body.substring(0, 200)}`);
    return false;
    
  } catch (error) {
    console.log(`❌ Create order: Error - ${error.message}`);
    return false;
  }
}

async function verifyFillWebhook() {
  try {
    console.log(`🔍 Testing Fill webhook`);
    const payload = {
      order_id: 'test_order_123',
      ticker: 'TEST',
      qty: 10,
      avg_cost: 50.00,
      filled_at: new Date().toISOString()
    };

    const response = await httpPost(`${BASE_URL}/api/portfolio/fills`, payload);
    
    // Should return either success or "not found" - both are valid
    if (response.status >= 200 && response.status < 500) {
      console.log(`✅ Fill webhook: OK (${response.status})`);
      return true;
    } else {
      console.log(`❌ Fill webhook: Expected 2xx-4xx, got ${response.status}`);
      console.log(`Response: ${response.body.substring(0, 200)}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Fill webhook: Error - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`🚀 Starting Portfolio Integration Verification`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  const checks = [
    () => verifyPortfolioPageServes(),
    () => verifyEndpoint('Portfolio positions API', `${BASE_URL}/api/portfolio/positions`),
    () => verifyDiscoveryContenders(),
    () => verifyCreateOrderLink(),
    () => verifyFillWebhook()
  ];

  let passed = 0;
  let total = checks.length;

  for (const check of checks) {
    if (await check()) {
      passed++;
    }
    console.log('');
  }

  console.log('='.repeat(50));
  console.log(`📊 Results: ${passed}/${total} checks passed`);
  
  if (passed === total) {
    console.log('🎉 All checks passed! Portfolio integration is working.');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed. Please review the errors above.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Verification script failed:', error);
    process.exit(1);
  });
}

module.exports = { httpGet, httpPost, verifyEndpoint };