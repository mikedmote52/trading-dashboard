// Script to fix deployed database by removing corrupt MFH data and adding real test data
const https = require('https');

async function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function fixDeployedDatabase() {
  const baseUrl = 'https://trading-dashboard-dvou.onrender.com';
  
  console.log('🔧 Checking current discoveries on deployed system...');
  const current = await makeRequest(`${baseUrl}/api/discoveries/latest`);
  console.log(`Found ${current.discoveries?.length || 0} discoveries`);
  
  if (current.discoveries?.length > 0) {
    console.log('Sample discovery:', JSON.stringify(current.discoveries[0], null, 2));
  }
  
  console.log('\n🚀 Running discovery scan to generate fresh data...');
  const scanResult = await makeRequest(`${baseUrl}/api/discoveries/scan`, 'POST');
  console.log('Scan initiated:', scanResult);
  
  // Wait for scan to complete
  if (scanResult.job) {
    console.log('⏳ Waiting for scan to complete...');
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      const status = await makeRequest(`${baseUrl}/api/discoveries/run/${scanResult.job}`);
      console.log(`Attempt ${attempts + 1}: ${status.job?.status} (${status.job?.candidates || 0} candidates)`);
      
      if (status.job?.status === 'done' || status.job?.status === 'error') {
        break;
      }
      attempts++;
    }
  }
  
  console.log('\n✅ Checking updated discoveries...');
  const updated = await makeRequest(`${baseUrl}/api/discoveries/latest`);
  console.log(`Now has ${updated.discoveries?.length || 0} discoveries`);
  
  if (updated.discoveries?.length > 0) {
    console.log('Sample updated discovery:', JSON.stringify(updated.discoveries[0], null, 2));
  }
}

fixDeployedDatabase().catch(console.error);