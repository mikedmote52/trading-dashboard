#!/usr/bin/env node

const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3003';

async function quickTest() {
    console.log('== Quick AlphaStack Debug ==');
    console.log(`BASE_URL=${BASE_URL}`);
    
    try {
        // Test health
        const healthRes = await fetch(`${BASE_URL}/health`);
        console.log(`Health: ${healthRes.status}`);
        
        // Test V1 criteria
        const v1Criteria = await fetch(`${BASE_URL}/api/alphastack/criteria`);
        const v1Data = await v1Criteria.json();
        console.log('V1 Criteria:', v1Data);
        
        // Test V2 criteria  
        const v2Criteria = await fetch(`${BASE_URL}/api/v2/scan/criteria`);
        const v2Data = await v2Criteria.json();
        console.log('V2 Criteria:', v2Data);
        
        // Test V1 scan
        const v1Scan = await fetch(`${BASE_URL}/api/alphastack/scan?limit=3`);
        if (v1Scan.status === 200) {
            const v1Results = await v1Scan.json();
            console.log(`V1 Scan: ${v1Results.candidates?.length || 0} candidates`);
        } else {
            console.log(`V1 Scan: ${v1Scan.status} error`);
        }
        
        // Test V2 scan
        const v2Scan = await fetch(`${BASE_URL}/api/v2/scan/squeeze`);
        const v2Results = await v2Scan.json();
        console.log(`V2 Scan: ${v2Results.results?.length || 0} candidates`);
        
        // Quick comparison
        console.log('\n== Quick Comparison ==');
        console.log('V1 uses:', v1Data.data_source);
        console.log('V2 uses:', v2Data.data_source);
        console.log('Key difference: V2 has', v2Data.caching, 'while V1 is on-demand');
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

quickTest();