const assert = require('assert');
const { persistDiscoveryBundle, getLatestBundle, generateInputSignature } = require('../db/discoveries');
const crypto = require('crypto');

// Mock data for testing
const mockDiscoveries = [
    { symbol: 'AAPL', name: 'Apple Inc.', score: 0.85, confidence: 0.85, momentum: 15.5, volume_spike: 3.2, risk: 'Low' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', score: 0.75, confidence: 0.75, momentum: 12.3, volume_spike: 2.8, risk: 'Medium' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', score: 0.70, confidence: 0.70, momentum: 10.1, volume_spike: 2.5, risk: 'Low' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', score: 0.65, confidence: 0.65, momentum: 8.7, volume_spike: 2.1, risk: 'Medium' },
    { symbol: 'TSLA', name: 'Tesla Inc.', score: 0.60, confidence: 0.60, momentum: 25.3, volume_spike: 5.2, risk: 'High' }
];

/**
 * Test 1: Two back-to-back runs over the same data produce identical results
 */
async function testDeterministicOrdering() {
    console.log('Running Test 1: Deterministic ordering...');
    
    const params = {
        universe: 'sp500',
        lookback_minutes: 30,
        resolution: '1min',
        polygon_key_tail: 'test'
    };
    
    // First run
    const runId1 = crypto.randomBytes(16).toString('hex');
    const bundle1 = {
        run_id: runId1,
        created_at: Date.now(),
        scanner_version: '0.1.0',
        input_signature: generateInputSignature(params),
        source_window: '2025-08-08 09:30–10:00 ET',
        items: [...mockDiscoveries]
    };
    
    persistDiscoveryBundle(bundle1);
    const result1 = getLatestBundle();
    
    // Second run with same data but different order
    const runId2 = crypto.randomBytes(16).toString('hex');
    const shuffledItems = [...mockDiscoveries].sort(() => Math.random() - 0.5);
    const bundle2 = {
        run_id: runId2,
        created_at: Date.now() + 1000,
        scanner_version: '0.1.0',
        input_signature: generateInputSignature(params),
        source_window: '2025-08-08 09:30–10:00 ET',
        items: shuffledItems
    };
    
    persistDiscoveryBundle(bundle2);
    const result2 = getLatestBundle();
    
    // Verify same input signature
    assert.strictEqual(
        result1.run.input_signature,
        result2.run.input_signature,
        'Input signatures should be identical for same parameters'
    );
    
    // Verify same ordering
    const symbols1 = result1.items.map(i => i.symbol);
    const symbols2 = result2.items.map(i => i.symbol);
    
    assert.deepStrictEqual(
        symbols1,
        symbols2,
        'Symbol ordering should be deterministic'
    );
    
    // Verify correct order (by score desc, then symbol asc)
    const expectedOrder = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];
    assert.deepStrictEqual(
        symbols2,
        expectedOrder,
        'Symbols should be ordered by score descending, then symbol ascending'
    );
    
    console.log('✅ Test 1 passed: Deterministic ordering verified');
}

/**
 * Test 2: API returns items equal to persisted rows
 */
async function testPersistedDataIntegrity() {
    console.log('Running Test 2: Data integrity...');
    
    const runId = crypto.randomBytes(16).toString('hex');
    const bundle = {
        run_id: runId,
        created_at: Date.now() + 10000, // Ensure this is the latest
        scanner_version: '0.2.0',
        input_signature: generateInputSignature({ test: true }),
        source_window: '2025-08-08 10:00–10:30 ET',
        note: 'Test run',
        items: mockDiscoveries
    };
    
    // Persist the bundle
    persistDiscoveryBundle(bundle);
    
    // Retrieve via API
    const result = getLatestBundle();
    
    // Verify run metadata
    assert.strictEqual(result.run.run_id, runId, 'Run ID should match');
    assert.strictEqual(result.run.scanner_version, '0.2.0', 'Scanner version should match');
    assert.strictEqual(result.run.note, 'Test run', 'Note should match');
    
    // Verify item count
    assert.strictEqual(
        result.items.length,
        mockDiscoveries.length,
        'Should have same number of items'
    );
    
    // Verify each item's data
    result.items.forEach((item, index) => {
        // Items should be sorted by score, so find the original
        const original = mockDiscoveries.find(d => d.symbol === item.symbol);
        assert(original, `Should find original for ${item.symbol}`);
        
        assert.strictEqual(item.symbol, original.symbol, 'Symbol should match');
        assert.strictEqual(item.name, original.name, 'Name should match');
        assert.strictEqual(item.confidence, original.confidence, 'Confidence should match');
        assert.strictEqual(item.momentum, original.momentum, 'Momentum should match');
        assert.strictEqual(item.volume_spike, original.volume_spike, 'Volume spike should match');
        assert.strictEqual(item.risk, original.risk, 'Risk should match');
        
        // Verify rank is set correctly
        assert.strictEqual(item.rank, index + 1, `Rank should be ${index + 1}`);
    });
    
    console.log('✅ Test 2 passed: Data integrity verified');
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('🧪 Running VIGL Discovery E2E Tests\n');
    
    try {
        await testDeterministicOrdering();
        console.log('');
        await testPersistedDataIntegrity();
        console.log('\n✅ All tests passed!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests();
}

module.exports = {
    testDeterministicOrdering,
    testPersistedDataIntegrity
};