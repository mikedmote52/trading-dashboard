#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Configuration
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

/**
 * Make HTTP request
 */
function request(options, data = null) {
    return new Promise((resolve, reject) => {
        const protocol = options.protocol === 'https:' ? https : http;
        
        const req = protocol.request(options, (res) => {
            let body = '';
            
            res.on('data', (chunk) => {
                body += chunk.toString();
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (err) {
                        resolve(body);
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                }
            });
        });
        
        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

/**
 * Enqueue a new discovery scan
 */
async function enqueueScan() {
    try {
        console.log('🔍 Enqueuing VIGL discovery scan...');
        
        const result = await request({
            hostname: HOST,
            port: PORT,
            path: '/api/discoveries/scan',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, { runMode: 'sync' });
        
        console.log('✅ Scan completed:', result);
        
        if (result.run_id) {
            console.log(`📊 Run ID: ${result.run_id}`);
            console.log(`📈 Discoveries found: ${result.count || 0}`);
        }
    } catch (error) {
        console.error('❌ Failed to enqueue scan:', error.message);
        process.exit(1);
    }
}

/**
 * Print latest discovery results
 */
async function printLatest() {
    try {
        console.log('📊 Fetching latest VIGL discoveries...\n');
        
        const result = await request({
            hostname: HOST,
            port: PORT,
            path: '/api/discoveries/latest',
            method: 'GET'
        });
        
        if (!result.run || !result.items) {
            console.log('No discovery runs found. Run --enqueue first.');
            return;
        }
        
        const run = result.run;
        const items = result.items;
        
        // Print run metadata
        const runDate = new Date(run.created_at);
        console.log(`🎯 VIGL Discovery Results`);
        console.log(`📅 ${runDate.toLocaleString()}`);
        console.log(`🔧 Scanner: v${run.scanner_version}`);
        console.log(`📊 Source: ${run.source_window}`);
        console.log(`🔑 Run ID: ${run.run_id.substring(0, 8)}...`);
        console.log('');
        
        if (items.length === 0) {
            console.log('No VIGL patterns found.');
            return;
        }
        
        // Print top 10 discoveries
        const topItems = items.slice(0, 10);
        console.log(`Top ${topItems.length} Discoveries:`);
        console.log('═'.repeat(60));
        
        topItems.forEach((item, index) => {
            const confidence = (item.confidence * 100).toFixed(1);
            const momentum = item.momentum > 0 ? `+${item.momentum.toFixed(1)}` : item.momentum.toFixed(1);
            const volume = item.volume_spike.toFixed(1);
            
            console.log(`\n${index + 1}. $${item.symbol} - ${item.name || 'Unknown'}`);
            console.log(`   💯 Confidence: ${confidence}%`);
            console.log(`   📈 Momentum: ${momentum}%`);
            console.log(`   📊 Volume: ${volume}x average`);
            console.log(`   ⚠️  Risk: ${item.risk}`);
        });
        
        if (items.length > 10) {
            console.log(`\n... and ${items.length - 10} more discoveries`);
        }
        
    } catch (error) {
        console.error('❌ Failed to fetch latest discoveries:', error.message);
        process.exit(1);
    }
}

/**
 * Show usage
 */
function showUsage() {
    console.log(`
VIGL Discovery Scanner CLI

Usage:
  node scripts/scan.js --enqueue      Enqueue a new discovery scan
  node scripts/scan.js --print-latest Print the latest discovery results

Options:
  --enqueue       Run a new VIGL discovery scan and wait for results
  --print-latest  Display the most recent discovery results

Environment:
  PORT=${PORT}
  HOST=${HOST}
`);
}

// Main execution
async function main() {
    if (command === '--enqueue') {
        await enqueueScan();
    } else if (command === '--print-latest') {
        await printLatest();
    } else {
        showUsage();
        process.exit(1);
    }
}

main();