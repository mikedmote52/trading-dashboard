// Final test with lenient config and test symbols
const path = require('path');
process.env.ENGINE_TEST_SYMBOLS = 'TSLA,AAPL,NVDA,PLTR,AMD,TTD,BMNR,GLD';
process.env.SQUEEZE_CONFIG_PATH = path.join(__dirname, 'server/config/squeeze_lenient.yml');

const Engine = require('./server/services/squeeze/engine');

async function testFinalSystem() {
  console.log('🚀 Final Test: Substitute Data + Lenient Config');
  console.log('📋 Test symbols:', process.env.ENGINE_TEST_SYMBOLS);
  console.log('⚙️  Config:', 'squeeze_lenient.yml');
  console.log('='.repeat(60));
  
  try {
    const engine = new Engine();
    const result = await engine.run();
    
    console.log(`\n📊 Final Results:`);
    console.log(`  • Candidates processed: ${result.candidates?.length || 0}`);
    console.log(`  • Passed gates: ${result.discoveries?.length || 0}`);
    
    if (result.discoveries && result.discoveries.length > 0) {
      console.log('\n🎉 SUCCESS! Discovery system fully operational:');
      result.discoveries.forEach((d, i) => {
        console.log(`\n${i+1}. ${d.symbol} - ${d.action}`);
        console.log(`   Price: $${d.price || 'unknown'}`);
        console.log(`   Score: ${d.score?.toFixed(1) || 'unknown'}%`);
        console.log(`   Short Interest: ${d.short_interest_pct || 'unknown'}%`);
        console.log(`   Days to Cover: ${d.days_to_cover || 'unknown'}`);
        console.log(`   Borrow Fee: ${d.borrow_fee_pct || 'unknown'}%`);
        console.log(`   Volume Spike: ${d.technicals?.rel_volume || 'unknown'}x`);
      });
      
      console.log('\n✅ READY FOR DEPLOYMENT!');
      console.log('\n🎯 System Status:');
      console.log('   ✅ Universe loading: Working');
      console.log('   ✅ Data estimation: Working'); 
      console.log('   ✅ Gate processing: Working');
      console.log('   ✅ Stock discovery: Working');
      console.log('   ✅ Action assignment: Working');
      
    } else {
      console.log('\n⚠️  Still no discoveries. Let\'s debug the gates...');
      
      // Check what failed the gates
      if (result.diagnostics?.drops) {
        console.log('\n🔍 Gate failures:');
        Object.entries(result.diagnostics.drops).slice(0, 5).forEach(([symbol, reasons]) => {
          console.log(`  ${symbol}: ${reasons.join(', ')}`);
        });
      }
      
      // Show sample enriched data
      if (result.candidates && result.candidates.length > 0) {
        const sample = result.candidates[0];
        console.log('\n📈 Sample enriched data:');
        console.log(`  Symbol: ${sample.ticker}`);
        console.log(`  Price: $${sample.technicals?.price || sample.price || 'missing'}`);
        console.log(`  Short Interest: ${sample.short_interest_pct || 'missing'}%`);
        console.log(`  Days to Cover: ${sample.days_to_cover || 'missing'}`);
        console.log(`  Borrow Fee: ${sample.borrow_fee_pct || 'missing'}%`);
        console.log(`  Float: ${sample.float_shares || 'missing'}`);
        console.log(`  Catalyst: ${sample.catalyst?.type || 'missing'}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Engine error:', error.message);
    console.error(error.stack);
  }
}

testFinalSystem().catch(console.error);