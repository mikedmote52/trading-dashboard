/**
 * Health Monitor with Rollback Guards
 * Monitors system health and triggers rollbacks if needed
 */

const metrics = {
  bypass_worker: { last_success: null, consecutive_failures: 0 },
  alphastack: { last_success: null, consecutive_failures: 0 },
  api_health: { last_check: null, status: 'unknown' }
};

const HEALTH_THRESHOLDS = {
  max_consecutive_failures: 3,
  max_age_ms: 5 * 60 * 1000, // 5 minutes
  critical_age_ms: 10 * 60 * 1000 // 10 minutes
};

/**
 * Record successful operation
 */
function recordSuccess(component, metadata = {}) {
  if (!metrics[component]) {
    metrics[component] = { last_success: null, consecutive_failures: 0 };
  }
  
  metrics[component].last_success = Date.now();
  metrics[component].consecutive_failures = 0;
  metrics[component].metadata = metadata;
  
  console.log(`✅ Health: ${component} success`);
}

/**
 * Record failure
 */
function recordFailure(component, error = null) {
  if (!metrics[component]) {
    metrics[component] = { last_success: null, consecutive_failures: 0 };
  }
  
  metrics[component].consecutive_failures += 1;
  metrics[component].last_failure = Date.now();
  metrics[component].last_error = error?.message || String(error);
  
  console.warn(`⚠️ Health: ${component} failure (${metrics[component].consecutive_failures}x) - ${error?.message}`);
  
  // Check if rollback needed
  if (shouldTriggerRollback(component)) {
    triggerRollback(component);
  }
}

/**
 * Check if component should trigger rollback
 */
function shouldTriggerRollback(component) {
  const metric = metrics[component];
  if (!metric) return false;
  
  // Too many consecutive failures
  if (metric.consecutive_failures >= HEALTH_THRESHOLDS.max_consecutive_failures) {
    return true;
  }
  
  // Component has been down too long
  if (metric.last_success) {
    const age = Date.now() - metric.last_success;
    if (age > HEALTH_THRESHOLDS.critical_age_ms) {
      return true;
    }
  }
  
  return false;
}

/**
 * Trigger rollback for component
 */
function triggerRollback(component) {
  console.error(`🚨 ROLLBACK TRIGGER: ${component} health check failed`);
  
  switch (component) {
    case 'bypass_worker':
      console.log('🔄 Rollback: Restarting bypass worker...');
      try {
        const { startDirectWorker } = require('../workers/discovery_direct_worker');
        startDirectWorker();
        recordSuccess(component, { action: 'worker_restart' });
      } catch (err) {
        console.error('❌ Rollback failed for bypass_worker:', err.message);
      }
      break;
      
    case 'alphastack':
      console.log('🔄 Rollback: Forcing AlphaStack refresh...');
      try {
        const { forceRefresh } = require('./alphastack/screener_runner');
        forceRefresh();
        recordSuccess(component, { action: 'force_refresh' });
      } catch (err) {
        console.error('❌ Rollback failed for alphastack:', err.message);
      }
      break;
      
    default:
      console.warn(`⚠️ No rollback handler for component: ${component}`);
  }
}

/**
 * Get overall system health
 */
function getSystemHealth() {
  const now = Date.now();
  const health = {};
  
  for (const [component, metric] of Object.entries(metrics)) {
    const age = metric.last_success ? now - metric.last_success : null;
    const isStale = age && age > HEALTH_THRESHOLDS.max_age_ms;
    const isCritical = age && age > HEALTH_THRESHOLDS.critical_age_ms;
    
    let status = 'unknown';
    if (metric.consecutive_failures >= HEALTH_THRESHOLDS.max_consecutive_failures) {
      status = 'critical';
    } else if (isCritical) {
      status = 'critical';
    } else if (isStale || metric.consecutive_failures > 0) {
      status = 'warning';
    } else if (metric.last_success) {
      status = 'healthy';
    }
    
    health[component] = {
      status,
      last_success: metric.last_success,
      age_ms: age,
      consecutive_failures: metric.consecutive_failures,
      last_error: metric.last_error,
      metadata: metric.metadata
    };
  }
  
  // Overall status
  const statuses = Object.values(health).map(h => h.status);
  let overall = 'healthy';
  if (statuses.includes('critical')) {
    overall = 'critical';
  } else if (statuses.includes('warning')) {
    overall = 'warning';
  }
  
  return { overall, components: health, timestamp: now };
}

/**
 * Run periodic health check
 */
function runHealthCheck() {
  const health = getSystemHealth();
  
  if (health.overall === 'critical') {
    console.error('🚨 SYSTEM CRITICAL:', health);
  } else if (health.overall === 'warning') {
    console.warn('⚠️ SYSTEM WARNING:', health);
  } else {
    console.log('✅ System health: OK');
  }
  
  return health;
}

// Run health check every 2 minutes
setInterval(runHealthCheck, 2 * 60 * 1000);

module.exports = {
  recordSuccess,
  recordFailure,
  getSystemHealth,
  runHealthCheck,
  shouldTriggerRollback,
  triggerRollback
};