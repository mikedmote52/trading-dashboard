#!/usr/bin/env node
require('dotenv').config();

const { scanOnce } = require('./server/services/discovery_service');

async function testFullResults() {
  try {
    console.log('🚀 Testing full results structure...');
    
    const result = await scanOnce();
    
    console.log('✅ Raw result keys:', Object.keys(result));
    console.log('📊 Engine:', result.engine);
    
    if (result.results && result.results.candidates) {
      console.log(`📈 Found ${result.results.candidates.length} candidates`);
      console.log('📋 Sample candidate:', JSON.stringify(result.results.candidates[0], null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testFullResults();