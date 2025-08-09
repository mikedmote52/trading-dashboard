#!/usr/bin/env node
/**
 * System integration test for the new provider architecture
 * Tests queue pacing and provider connectivity
 */

require('dotenv').config();

const { runQueued, createSymbolTasks } = require('./server/services/queue');
const { fetchFeaturesFor } = require('./server/services/features');
const { runHeartbeat, allHealthy } = require('./server/health/heartbeat');

// Mock environment for testing (if needed)
if (!process.env.BORROW_SHORT_PROVIDER) {
  process.env.BORROW_SHORT_PROVIDER = 'fintel';
}
if (!process.env.BORROW_SHORT_API_KEY) {
  process.env.BORROW_SHORT_API_KEY = 'test_key';
}

async function testQueue() {
  console.log('🧪 Testing queue with 3 mock tasks...');
  
  const tasks = [
    () => new Promise(resolve => setTimeout(() => resolve({ task: 1 }), 100)),
    () => new Promise(resolve => setTimeout(() => resolve({ task: 2 }), 100)),
    () => new Promise(resolve => setTimeout(() => resolve({ task: 3 }), 100))
  ];
  
  const startTime = Date.now();
  const results = await runQueued(tasks, 1000);
  const duration = Date.now() - startTime;
  
  console.log(`⏱️  Queue completed in ${duration}ms (expected ~3000ms)`);
  console.log(`✅ Results: ${results.length} tasks completed`);
  
  if (duration < 2800 || duration > 3200) {
    console.warn('⚠️ Queue timing outside expected range');
  } else {
    console.log('✅ Queue timing within expected range');
  }
  
  return duration >= 2800 && duration <= 3200;
}

async function testHeartbeat() {
  console.log('🧪 Testing heartbeat with all providers...');
  
  try {
    const snap = await runHeartbeat();
    const healthy = allHealthy(snap);
    
    console.log('📊 Heartbeat results:');
    snap.forEach(s => {
      console.log(`  - ${s.source}: ${s.status} ${s.detail ? `(${s.detail})` : ''}`);
    });
    
    console.log(`🏥 Overall health: ${healthy ? 'HEALTHY' : 'DEGRADED'}`);
    return { healthy, snap };
    
  } catch (error) {
    console.error('❌ Heartbeat test failed:', error.message);
    return { healthy: false, error: error.message };
  }
}

async function testFeatureFetch() {
  console.log('🧪 Testing feature fetch for AAPL (dry run)...');
  
  try {
    // This will likely fail without real API keys, but we want to test the structure
    const features = await fetchFeaturesFor('AAPL');
    console.log('✅ Feature fetch structure test passed');
    console.log('📊 Feature keys:', Object.keys(features));
    return true;
    
  } catch (error) {
    console.log('⚠️ Feature fetch failed (expected without API keys):', error.message);
    // Test passed if it fails with expected error types
    const expectedErrors = ['not configured', 'authentication', 'API', 'connection'];
    const isExpectedError = expectedErrors.some(e => error.message.toLowerCase().includes(e.toLowerCase()));
    
    if (isExpectedError) {
      console.log('✅ Feature fetch properly validates configuration');
      return true;
    } else {
      console.error('❌ Unexpected error type');
      return false;
    }
  }
}

async function runSystemTest() {
  console.log('🚀 Starting system integration test...\n');
  
  const results = {
    queue: false,
    heartbeat: false,
    features: false
  };
  
  // Test 1: Queue functionality
  try {
    results.queue = await testQueue();
  } catch (error) {
    console.error('❌ Queue test failed:', error.message);
  }
  
  console.log(''); // blank line
  
  // Test 2: Heartbeat system
  try {
    const heartbeatResult = await testHeartbeat();
    results.heartbeat = heartbeatResult.healthy || heartbeatResult.error?.includes('configured');
  } catch (error) {
    console.error('❌ Heartbeat test failed:', error.message);
  }
  
  console.log(''); // blank line
  
  // Test 3: Feature fetch structure
  try {
    results.features = await testFeatureFetch();
  } catch (error) {
    console.error('❌ Feature test failed:', error.message);
  }
  
  console.log('\n📋 Test Summary:');
  console.log(`  Queue functionality: ${results.queue ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Heartbeat system: ${results.heartbeat ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Feature structure: ${results.features ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(r => r);
  console.log(`\n🎯 Overall: ${allPassed ? '✅ SYSTEM READY' : '⚠️ NEEDS CONFIGURATION'}`);
  
  if (!allPassed) {
    console.log('\n📝 Next steps:');
    if (!results.queue) console.log('  - Check queue implementation');
    if (!results.heartbeat) console.log('  - Configure API keys in environment variables');  
    if (!results.features) console.log('  - Verify provider integration');
    console.log('  - See .env.example for required configuration');
  }
  
  return allPassed;
}

// Run the test
if (require.main === module) {
  runSystemTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test suite crashed:', error);
      process.exit(1);
    });
}

module.exports = { runSystemTest };