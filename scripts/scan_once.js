#!/usr/bin/env node
// Suppress all database and engine logs for clean JSON output
const originalLog = console.log;
const originalError = console.error;
console.log = () => {};
console.error = () => {};

const { scanOnce } = require('../server/services/discovery_service');

(async () => {
  try {
    const { engine, results } = await scanOnce();
    // Restore console.log only for final JSON output
    console.log = originalLog;
    console.log(JSON.stringify({ 
      engine, 
      count: results?.length || 0, 
      sample: (results || []).slice(0, 1) 
    }));
  } catch (error) {
    console.log = originalLog;
    console.log(JSON.stringify({ 
      engine: 'error', 
      count: 0, 
      error: error.message 
    }));
    process.exit(1);
  }
})();