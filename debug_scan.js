#!/usr/bin/env node

require('dotenv').config();

// Enable all logging to see what's happening
const originalLog = console.log;
const originalError = console.error;

console.log('🧪 Debug Scan - Full Logging Enabled');

const { scanOnce } = require('./server/services/discovery_service');

async function debugScan() {
  try {
    console.log('🚀 Starting debug scan...');
    
    const result = await scanOnce();
    
    console.log('✅ Scan completed!');
    console.log('📊 Raw result structure:', Object.keys(result));
    console.log('📊 Engine:', result.engine);
    console.log('📊 Results:', result.results ? Object.keys(result.results) : 'No results key');
    
    if (result.results) {
      console.log('📈 Discovery metrics:', result.results.discovery_metrics);
      console.log('📈 Universe count:', result.results.universe_count);
      console.log('📈 Prefiltered count:', result.results.prefiltered_count);
      console.log('📈 Enriched count:', result.results.enriched_count);
      console.log('📈 Candidates count:', result.results.candidates ? result.results.candidates.length : 'No candidates');
    }
    
  } catch (error) {
    console.error('❌ Debug scan error:', error);
  }
}

debugScan();