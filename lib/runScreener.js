/**
 * Legacy runScreener wrapper - now uses singleton pattern
 * Maintains backward compatibility while preventing overlapping screener runs
 */

const fs = require('fs');

async function runScreener(profileArgs = [], timeoutMs = 180000) {
  try {
    // Import the singleton wrapper
    const { runScreenerSingleton } = require('../server/lib/screenerSingleton');
    
    // If profileArgs is an object with timeoutMs, use it
    if (typeof profileArgs === 'object' && !Array.isArray(profileArgs) && profileArgs.timeoutMs) {
      timeoutMs = profileArgs.timeoutMs;
      profileArgs = profileArgs.args || [];
    }
    
    // Parse legacy profile args to extract limit if present
    let limit = 10;
    const limitMatch = profileArgs.find(arg => arg.startsWith('--limit'));
    if (limitMatch) {
      const limitValue = limitMatch.includes('=') ? limitMatch.split('=')[1] : 
                        profileArgs[profileArgs.indexOf(limitMatch) + 1];
      if (limitValue && !isNaN(limitValue)) {
        limit = parseInt(limitValue);
      }
    }
    
    console.log(`[runScreener] Legacy wrapper calling singleton: limit=${limit}, timeout=${timeoutMs}ms`);
    
    const result = await runScreenerSingleton({
      limit,
      budgetMs: Math.min(timeoutMs - 1000, 60000), // Convert timeout to budget with safety margin
      jsonOut: '/tmp/discovery_screener.json',
      caller: 'legacy_wrapper'
    });
    
    // Read the JSON result
    let json = null;
    try {
      if (fs.existsSync(result.jsonOut)) {
        const raw = fs.readFileSync(result.jsonOut, 'utf8');
        if (raw && raw.trim().length) {
          json = JSON.parse(raw);
        }
      }
    } catch (e) {
      console.warn(`[runScreener] Failed to parse JSON: ${e.message}`);
    }
    
    if (!json) {
      throw new Error(`No valid JSON output from screener. code=${result.code} duration=${result.durationMs}ms`);
    }
    
    // Return legacy format: { json, exitCode, duration, stdout, stderr }
    return {
      json,
      exitCode: result.code,
      duration: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr
    };
    
  } catch (error) {
    console.error(`[runScreener] Legacy wrapper error:`, error.message);
    throw error;
  }
}

// Legacy function wrapper for compatibility
function runScreenerLegacy(args = [], timeoutMs = 90000) {
  return runScreener(args, timeoutMs).then(result => {
    // New format returns { json, exitCode, duration, stdout, stderr }
    if (result && result.json && Array.isArray(result.json.items)) {
      return result.json; // Return the JSON payload directly
    } else if (Array.isArray(result)) {
      // Handle legacy direct array result
      return { items: result };
    } else if (result && result.items) {
      return { items: result.items };
    } else {
      return { items: [] };
    }
  }).catch(error => {
    return { items: [], error: error.message };
  });
}

module.exports = { runScreener, runScreenerLegacy };