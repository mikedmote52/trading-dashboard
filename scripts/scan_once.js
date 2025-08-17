#!/usr/bin/env node
const { scanOnce } = require('../server/services/discovery_service');

(async () => {
  try {
    const { engine, results } = await scanOnce();
    console.log(JSON.stringify({
      engine,
      count: results.length,
      sample: results.slice(0, 3)
    }));
  } catch (error) {
    console.log(JSON.stringify({
      engine: 'error',
      count: 0,
      error: error.message
    }));
    process.exit(1);
  }
})();