#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

// Test the universe size to verify full market scanning
const DS = require('./server/services/squeeze/data_sources');

async function testUniverse() {
  console.log('🌐 Testing full market universe...');
  
  try {
    const universe = await DS.get_universe();
    console.log(`📊 Full market universe: ${universe.length} stocks`);
    
    // Show a sample of the stocks
    const sample = universe.slice(0, 20);
    console.log(`📋 Sample stocks: ${sample.join(', ')}`);
    
    // Show some stats
    const shortTickers = universe.filter(t => t.length <= 3).length;
    const mediumTickers = universe.filter(t => t.length === 4).length;
    const longTickers = universe.filter(t => t.length === 5).length;
    
    console.log(`📈 Ticker length distribution:`);
    console.log(`  1-3 chars: ${shortTickers}`);
    console.log(`  4 chars: ${mediumTickers}`);
    console.log(`  5 chars: ${longTickers}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testUniverse();