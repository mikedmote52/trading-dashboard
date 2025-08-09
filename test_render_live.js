#!/usr/bin/env node
/**
 * Test live Render environment end-to-end
 */

const https = require('https');
const RENDER_URL = 'https://trading-dashboard-dvou.onrender.com';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data.substring(0, 200) });
        }
      });
    }).on('error', reject);
  });
}

async function testRenderEnvironment() {
  console.log('🔍 Testing live Render environment...\n');
  
  try {
    // Test 1: Health endpoint
    console.log('1. Testing health endpoint...');
    const health = await fetchJSON(`${RENDER_URL}/api/health`);
    console.log(`   Status: ${health.status}`);
    if (health.status === 200 && health.data.status) {
      console.log(`   ✅ Health: ${health.data.status}`);
    } else {
      console.log(`   ❌ Health check failed: ${JSON.stringify(health.data).substring(0, 100)}`);
    }
    
    // Test 2: Discoveries endpoint
    console.log('\n2. Testing discoveries endpoint...');
    const discoveries = await fetchJSON(`${RENDER_URL}/api/discoveries/top`);
    console.log(`   Status: ${discoveries.status}`);
    if (discoveries.status === 200 && discoveries.data.discoveries) {
      const count = discoveries.data.discoveries.length;
      console.log(`   ✅ Found ${count} discoveries`);
      
      if (count > 0) {
        console.log('   📈 Top 3 discoveries:');
        discoveries.data.discoveries.slice(0, 3).forEach((d, i) => {
          console.log(`      ${i+1}. ${d.symbol}: ${d.volumeSpike}x volume, ${d.momentum?.toFixed(1)}% momentum`);
        });
        
        // Check for real vs fake data
        const hasRealData = discoveries.data.discoveries.some(d => 
          d.symbol !== 'AAPL' && d.volumeSpike > 0 && Math.abs(d.volumeSpike) !== d.volumeSpike
        );
        
        if (hasRealData) {
          console.log('   ✅ Contains real discovery data');
        } else {
          console.log('   ⚠️ May still contain stale/fake data');
        }
      } else {
        console.log('   ⚠️ No discoveries found');
      }
    } else {
      console.log(`   ❌ Discoveries endpoint failed: ${JSON.stringify(discoveries.data).substring(0, 100)}`);
    }
    
    // Test 3: Admin status (if accessible)
    console.log('\n3. Testing admin status...');
    const adminStatus = await fetchJSON(`${RENDER_URL}/api/admin/status`);
    console.log(`   Status: ${adminStatus.status}`);
    if (adminStatus.status === 200) {
      console.log('   ✅ Admin endpoints accessible');
    } else {
      console.log('   ⚠️ Admin endpoints require authentication');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 RENDER ENVIRONMENT TEST SUMMARY:');
    
    if (health.status === 200 && discoveries.status === 200 && discoveries.data.discoveries?.length > 0) {
      console.log('✅ PASS: Render environment is functional');
      
      // Check for specific known good discoveries
      const symbols = discoveries.data.discoveries.map(d => d.symbol);
      const hasViglSymbols = ['MRM', 'SPRU', 'ORIS', 'HRTX'].some(s => symbols.includes(s));
      
      if (hasViglSymbols) {
        console.log('✅ EXCELLENT: Contains real VIGL discoveries');
      } else {
        console.log('⚠️ PARTIAL: Environment works but may need fresh data');
      }
    } else {
      console.log('❌ FAIL: Render environment has issues');
    }
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testRenderEnvironment();