#!/usr/bin/env node
// Quick debug script to see what discovery data looks like
const https = require('https');

https.get('https://trading-dashboard-dvou.onrender.com/api/admin/debug-db', {
  headers: { 'Authorization': 'Bearer 656ccdf7a4a4b2412d47009cea9f43c7' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('Sample discovery from debug-db:');
    console.log(JSON.stringify(result.top_discoveries[0], null, 2));
  });
});