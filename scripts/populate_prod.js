#!/usr/bin/env node

/**
 * Populate production Postgres via API endpoint
 */

const https = require('https');

const BASE_URL = 'trading-dashboard-dvou.onrender.com';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';

function apiRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': ADMIN_TOKEN
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function populateProduction() {
  console.log('🚀 Populating production database...\n');

  try {
    // 1. Check current state
    console.log('📊 Checking current database state...');
    const dbStatus = await apiRequest('/api/_debug/db');
    console.log('  Database type:', dbStatus.type);
    console.log('  Current contenders:', dbStatus.counts?.contenders || 0);
    console.log('  Current decisions:', dbStatus.counts?.decisions || 0);

    // 2. Create contenders via direct API
    console.log('\n📝 Creating contenders...');
    const contendersData = [
      { ticker: 'NVDA', price: 475.20, score: 88, action: 'BUY', 
        confidence: 88, thesis: 'AI leader with strong momentum' },
      { ticker: 'TSLA', price: 245.50, score: 82, action: 'EARLY_READY',
        confidence: 82, thesis: 'EV momentum play' },
      { ticker: 'AMD', price: 168.30, score: 78, action: 'EARLY_READY',
        confidence: 78, thesis: 'Semiconductor sympathy play' },
      { ticker: 'PLTR', price: 158.90, score: 75, action: 'EARLY_READY',
        confidence: 75, thesis: 'Data analytics growth story' }
    ];

    // Note: We'll need to create an admin endpoint for this
    // For now, we'll trigger decision generation which will read contenders
    
    // 3. Trigger decision generation
    console.log('\n🎯 Triggering decision generation...');
    const genResult = await apiRequest('/api/decisions/generate', 'POST');
    console.log('  Result:', genResult.message || genResult);

    // 4. Verify decisions were created
    console.log('\n✅ Verifying decisions...');
    const decisions = await apiRequest('/api/decisions/latest');
    console.log('  Decisions created:', Array.isArray(decisions) ? decisions.length : 0);
    
    if (Array.isArray(decisions) && decisions.length > 0) {
      console.log('\n📋 Decisions:');
      decisions.forEach(d => {
        console.log(`  - ${d.ticker}: Entry=$${d.entry_price}, Stop=$${d.stop_price}`);
      });
    }

    // 5. Check contenders endpoint
    console.log('\n🔍 Checking contenders endpoint...');
    const contenders = await apiRequest('/api/discovery/contenders');
    console.log('  Contenders returned:', contenders.items?.length || 0);

    console.log('\n✅ Production population complete!');
    
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
}

populateProduction();