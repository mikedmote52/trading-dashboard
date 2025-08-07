#!/usr/bin/env node
/**
 * VIGL Discovery Updater
 * Runs the Python script locally and saves results for web dashboard
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function updateViglDiscoveries() {
    console.log('🔍 Running VIGL discovery scan...');
    
    try {
        // Run Python script locally
        const output = execSync('python3 VIGL_Discovery_Complete.py --json', {
            timeout: 300000, // 5 minute timeout
            encoding: 'utf8',
            cwd: __dirname
        });
        
        const discoveries = JSON.parse(output.trim());
        
        // Save to file for web dashboard
        const outputPath = path.join(__dirname, 'live_vigl_discoveries.json');
        const dataToSave = {
            discoveries: discoveries,
            lastUpdated: new Date().toISOString(),
            scanTime: new Date().toLocaleString(),
            count: discoveries.length
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(dataToSave, null, 2));
        
        console.log(`✅ Found ${discoveries.length} VIGL patterns`);
        console.log(`📁 Saved to: ${outputPath}`);
        
        // Show summary
        discoveries.forEach(d => {
            console.log(`   ${d.symbol}: ${(d.confidence * 100).toFixed(0)}% confidence (${d.volumeSpike}x volume, ${d.momentum}% momentum)`);
        });
        
        return discoveries;
        
    } catch (error) {
        console.error('❌ VIGL scan failed:', error.message);
        
        // Create empty result file
        const outputPath = path.join(__dirname, 'live_vigl_discoveries.json');
        const emptyData = {
            discoveries: [],
            lastUpdated: new Date().toISOString(),
            scanTime: new Date().toLocaleString(),
            count: 0,
            error: error.message
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(emptyData, null, 2));
        return [];
    }
}

if (require.main === module) {
    updateViglDiscoveries();
}

module.exports = { updateViglDiscoveries };