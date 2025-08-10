#!/usr/bin/env node

const Engine = require('./server/services/squeeze/engine');

async function testEngine() {
  console.log('🧪 Testing engine with JSON cache data...');
  
  try {
    const engine = new Engine();
    const result = await engine.run();
    
    console.log('📊 Engine run results:');
    console.log(`  Universe count: ${result.universe_count}`);
    console.log(`  Candidates: ${result.candidates?.length || 0}`);
    console.log(`  Preset: ${result.preset}`);
    console.log(`  As of: ${result.asof}`);
    
    if (result.candidates?.length > 0) {
      console.log('\n✅ SUCCESS: At least one symbol reached passed after gates');
      console.log('First candidate:');
      console.log(`  Symbol: ${result.candidates[0].ticker}`);
      console.log(`  Action: ${result.candidates[0].action}`);
      console.log(`  Score: ${result.candidates[0].composite_score}`);
    } else {
      console.log('\n❌ No candidates passed gates - check diagnostics');
    }
    
  } catch (error) {
    console.error('❌ Engine test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testEngine();
}

module.exports = { testEngine };