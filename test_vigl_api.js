#!/usr/bin/env node
/**
 * Test VIGL API - Validate the discovery endpoint with mock data
 */

const https = require('https');

// Mock VIGL discovery data with proper format
const mockDiscoveries = [
    {
        symbol: 'TSLA',
        score: 8.5,  // Should get BUY action
        price: 245.67,
        confidence: 0.85,
        volume_spike: 22.1,
        momentum: 12.5,
        catalyst: 'Earnings catalyst',
        timestamp: new Date().toISOString()
    },
    {
        symbol: 'AAPL', 
        score: 5.2,  // Should get MONITOR action
        price: 178.45,
        confidence: 0.52,
        volume_spike: 3.4,
        momentum: 8.1,
        catalyst: 'Volume spike',
        timestamp: new Date().toISOString()
    },
    {
        symbol: 'NVDA',
        score: 1.8,  // Should get WATCHLIST action  
        price: 445.23,
        confidence: 0.18,
        volume_spike: 1.9,
        momentum: 2.3,
        catalyst: 'Pattern match',
        timestamp: new Date().toISOString()
    }
];

async function testViglAPI(host = 'localhost', port = 3001) {
    console.log('🧪 Testing VIGL API Discovery Endpoint...\n');
    
    const postData = JSON.stringify(mockDiscoveries);
    
    const options = {
        hostname: host,
        port: port,
        path: '/api/run-vigl-discovery',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        console.log(`📡 POST ${host}:${port}/api/run-vigl-discovery`);
        console.log(`📊 Payload: ${mockDiscoveries.length} discoveries`);
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log(`\n✅ Response (${res.statusCode}):`);
                    console.log(JSON.stringify(response, null, 2));
                    
                    if (response.success) {
                        console.log(`\n🎯 Success: ${response.count} discoveries inserted`);
                        if (response.errors && response.errors.length > 0) {
                            console.log(`⚠️ Errors: ${response.errors.length}`);
                        }
                    } else {
                        console.log(`❌ Failed: ${response.error}`);
                    }
                    
                    resolve(response);
                } catch (error) {
                    console.error('❌ Failed to parse response:', error.message);
                    console.log('Raw response:', data);
                    reject(error);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('❌ Request failed:', error.message);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

async function verifyInDatabase() {
    console.log('\n🔍 Verifying discoveries in database...');
    
    try {
        const db = require('./server/db/sqlite');
        
        const recentDiscoveries = db.db.prepare(`
            SELECT symbol, score, action, price, created_at
            FROM discoveries 
            WHERE symbol IN ('TSLA', 'AAPL', 'NVDA')
            ORDER BY created_at DESC
            LIMIT 10
        `).all();
        
        console.log(`📊 Found ${recentDiscoveries.length} matching discoveries:`);
        recentDiscoveries.forEach(d => {
            console.log(`   ${d.symbol}: ${d.score} → ${d.action} ($${d.price})`);
        });
        
        // Check action distribution
        const actionCounts = db.db.prepare(`
            SELECT action, COUNT(*) as count
            FROM discoveries 
            WHERE action IS NOT NULL
            GROUP BY action
        `).all();
        
        console.log('\n📈 Action Distribution:');
        actionCounts.forEach(row => {
            console.log(`   ${row.action}: ${row.count}`);
        });
        
    } catch (error) {
        console.error('❌ Database verification failed:', error.message);
    }
}

// Generate cURL command
function generateCurlCommand() {
    console.log('\n📋 cURL Command for Manual Testing:');
    console.log('```bash');
    console.log('curl -X POST http://localhost:3001/api/run-vigl-discovery \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'[');
    mockDiscoveries.forEach((discovery, index) => {
        const comma = index < mockDiscoveries.length - 1 ? ',' : '';
        console.log(`    ${JSON.stringify(discovery)}${comma}`);
    });
    console.log('  ]\'');
    console.log('```\n');
}

// Main test function
async function runTests() {
    try {
        generateCurlCommand();
        
        // Test the API
        await testViglAPI();
        
        // Wait a moment for database write
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify in database
        await verifyInDatabase();
        
        console.log('\n✅ VIGL API Test Complete');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runTests();
}

module.exports = { testViglAPI, mockDiscoveries };