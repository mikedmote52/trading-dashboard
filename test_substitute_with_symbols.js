// Test substitute system with known symbols
process.env.ENGINE_TEST_SYMBOLS = 'TSLA,AAPL,NVDA,PLTR,AMD';

const Engine = require('./server/services/squeeze/engine');

async function testWithSymbols() {
  console.log('🧪 Testing Substitute System with Known Symbols');
  console.log('📋 Test symbols:', process.env.ENGINE_TEST_SYMBOLS);
  console.log('='.repeat(60));
  
  try {
    const engine = new Engine();
    const result = await engine.run();
    
    console.log(`\n📊 Engine Results:`);
    console.log(`  • Universe size: ${result.universe_size || 'unknown'}`);
    console.log(`  • Candidates processed: ${result.candidates?.length || 0}`);
    console.log(`  • Discoveries found: ${result.discoveries?.length || 0}`);
    
    if (result.discoveries && result.discoveries.length > 0) {
      console.log('\n🎉 SUCCESS! Found discoveries using substitute data:');
      result.discoveries.forEach((d, i) => {
        console.log(`\n${i+1}. ${d.symbol} - ${d.action}`);
        console.log(`   Price: $${d.price || 'unknown'}`);
        console.log(`   Score: ${d.score?.toFixed(1) || 'unknown'}`);
        console.log(`   Short Interest: ${d.short_interest_pct || 'unknown'}%`);
        console.log(`   Days to Cover: ${d.days_to_cover || 'unknown'}`);
        console.log(`   Borrow Fee: ${d.borrow_fee_pct || 'unknown'}%`);
        if (d.catalyst_type) {
          console.log(`   Catalyst: ${d.catalyst_type}`);
        }
      });
      
      console.log('\n✅ SYSTEM IS WORKING! Ready to deploy.');
      
    } else {
      console.log('\n⚠️  No discoveries found. This might be normal if thresholds are strict.');
      console.log('Let\'s check what data was enriched...');
      
      if (result.candidates && result.candidates.length > 0) {
        console.log('\nSample candidate data:');
        const sample = result.candidates[0];
        console.log(`  Symbol: ${sample.ticker}`);
        console.log(`  Price: $${sample.technicals?.price || 'missing'}`);
        console.log(`  Short Interest: ${sample.short_interest_pct || 'missing'}%`);
        console.log(`  Borrow Fee: ${sample.borrow_fee_pct || 'missing'}%`);
        console.log(`  Catalyst: ${sample.catalyst?.type || 'missing'}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Engine error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testWithSymbols().catch(console.error);