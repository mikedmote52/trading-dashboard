// Test script to use lenient configuration and verify stock discoveries
const path = require('path');
process.env.SQUEEZE_CONFIG_PATH = path.join(__dirname, 'server/config/squeeze_lenient.yml');

const Engine = require('./server/services/squeeze/engine');

async function testLenientDiscovery() {
  console.log('🔧 Testing Lenient Discovery Configuration');
  console.log('📁 Using config:', process.env.SQUEEZE_CONFIG_PATH);
  
  try {
    const engine = new Engine();
    console.log('\n🚀 Running engine with lenient settings...');
    
    const result = await engine.run();
    
    console.log('\n📊 Engine Results:');
    console.log(`- Total candidates processed: ${result.candidates?.length || 0}`);
    console.log(`- Discoveries found: ${result.discoveries?.length || 0}`);
    
    if (result.discoveries && result.discoveries.length > 0) {
      console.log('\n✅ DISCOVERIES FOUND:');
      result.discoveries.forEach((d, i) => {
        console.log(`${i+1}. ${d.symbol}`);
        console.log(`   Price: $${d.price}`);
        console.log(`   Score: ${d.score.toFixed(1)}`);
        console.log(`   Action: ${d.action}`);
        console.log(`   Short Interest: ${d.short_interest_pct}%`);
        console.log(`   Days to Cover: ${d.days_to_cover}`);
        console.log('');
      });
    } else {
      console.log('\n❌ No discoveries found. Checking diagnostics...');
      
      // Check what stocks were dropped
      if (result.diagnostics && result.diagnostics.drops) {
        console.log('\n🔍 Stocks dropped by gates:');
        const drops = Object.entries(result.diagnostics.drops).slice(0, 5);
        drops.forEach(([symbol, reasons]) => {
          console.log(`${symbol}: ${reasons.join(', ')}`);
        });
      }
    }
    
    console.log('\n🎯 Recommendation:');
    if (result.discoveries && result.discoveries.length > 0) {
      console.log('✅ System working! Deploy lenient config to production.');
    } else {
      console.log('❌ Still no discoveries. Need to investigate further or add more test data.');
    }
    
  } catch (error) {
    console.error('❌ Engine error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testLenientDiscovery().catch(console.error);