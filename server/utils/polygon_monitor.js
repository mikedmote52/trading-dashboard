/**
 * Polygon API Monitoring and Health Check
 */

const axios = require('axios');

let polygonStatus = {
  status: 'unknown',
  lastCheck: 0,
  rateLimited: false,
  errorCount: 0,
  consecutive429s: 0
};

const POLYGON_KEY = process.env.POLYGON_API_KEY;
const CHECK_INTERVAL = 60000; // 1 minute
const MAX_ERRORS = 5;
const RATE_LIMIT_COOLDOWN = 300000; // 5 minutes

/**
 * Check Polygon API health
 */
async function checkPolygonHealth() {
  if (!POLYGON_KEY) {
    polygonStatus.status = 'no_key';
    return polygonStatus;
  }

  const now = Date.now();
  
  // Don't check too frequently
  if (now - polygonStatus.lastCheck < CHECK_INTERVAL) {
    return polygonStatus;
  }
  
  // If we're rate limited, wait for cooldown
  if (polygonStatus.rateLimited && now - polygonStatus.lastCheck < RATE_LIMIT_COOLDOWN) {
    return polygonStatus;
  }

  try {
    // Simple health check using market status endpoint (low cost)
    const url = `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_KEY}`;
    const response = await axios.get(url, { timeout: 5000 });
    
    if (response.status === 200) {
      polygonStatus.status = 'ok';
      polygonStatus.errorCount = 0;
      polygonStatus.consecutive429s = 0;
      polygonStatus.rateLimited = false;
    } else {
      polygonStatus.status = 'error';
      polygonStatus.errorCount++;
    }
    
  } catch (error) {
    polygonStatus.errorCount++;
    
    if (error.response?.status === 429) {
      polygonStatus.consecutive429s++;
      if (polygonStatus.consecutive429s >= 3) {
        polygonStatus.rateLimited = true;
        polygonStatus.status = 'rate_limited';
        console.warn(`🚨 Polygon API rate limited (${polygonStatus.consecutive429s} consecutive 429s)`);
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      polygonStatus.status = 'network_error';
    } else {
      polygonStatus.status = 'error';
    }
    
    console.warn(`⚠️ Polygon health check failed:`, error.message);
  }
  
  polygonStatus.lastCheck = now;
  
  // If too many errors, mark as down
  if (polygonStatus.errorCount >= MAX_ERRORS) {
    polygonStatus.status = 'down';
    console.error(`🚨 Polygon API marked as down (${polygonStatus.errorCount} consecutive errors)`);
  }
  
  return polygonStatus;
}

/**
 * Get current Polygon status
 */
function getPolygonStatus() {
  return {
    ...polygonStatus,
    hasKey: !!POLYGON_KEY,
    lastCheckAge: Date.now() - polygonStatus.lastCheck
  };
}

/**
 * Reset rate limit status (for manual override)
 */
function resetRateLimit() {
  polygonStatus.rateLimited = false;
  polygonStatus.consecutive429s = 0;
  polygonStatus.errorCount = 0;
  console.log('✅ Polygon rate limit status reset');
}

/**
 * Simple middleware to log Polygon usage
 */
function logPolygonUsage(endpoint, success = true) {
  const timestamp = new Date().toISOString();
  console.log(`📡 Polygon API: ${endpoint} ${success ? '✅' : '❌'} ${timestamp}`);
  
  if (!success) {
    polygonStatus.errorCount++;
  }
}

module.exports = {
  checkPolygonHealth,
  getPolygonStatus,
  resetRateLimit,
  logPolygonUsage
};