/**
 * Basic Prometheus metrics collection for API observability
 * Parses Python screener [metrics] output and increments counters
 */

// Simple in-memory counters
const metrics = {
  polygon_http_200_total: 0,
  polygon_http_401_total: 0,  
  polygon_http_429_total: 0,
  polygon_http_500_total: 0,
  polygon_live_fail_total: 0,
  screener_runs_total: 0,
  screener_cached_runs_total: 0,
  screener_live_runs_total: 0,
  discoveries_inserted_total: 0,
  // Outcome tracking metrics
  labeler_labeled_total_BIG_WIN: 0,
  labeler_labeled_total_WIN: 0,
  labeler_labeled_total_NEUTRAL: 0,
  labeler_labeled_total_LOSS: 0,
  labeler_labeled_total_BIG_LOSS: 0,
  labeler_labeled_total_ERROR: 0,
  labeler_labeled_total_INSUFFICIENT_DATA: 0,
  outcomes_open_total: 0,
  outcomes_win_total: 0,
  outcomes_loss_total: 0
};

/**
 * Parse Python screener output for [metrics] lines and update counters
 */
function parseScreenerMetrics(stderr = '', stdout = '') {
  const output = `${stderr}\n${stdout}`;
  
  // Look for [metrics] lines like: [metrics] {"polygon_http_200": 3, "polygon_http_401": 1}
  const metricsMatch = output.match(/\[metrics\]\s*({.*})/);
  if (metricsMatch) {
    try {
      const parsed = JSON.parse(metricsMatch[1]);
      
      // Increment totals based on parsed metrics
      for (const [key, count] of Object.entries(parsed)) {
        const totalKey = `${key}_total`;
        if (totalKey in metrics) {
          metrics[totalKey] += count;
        }
      }
      
      console.log(`[prometheus] Updated metrics from screener:`, parsed);
    } catch (e) {
      console.warn(`[prometheus] Failed to parse metrics:`, metricsMatch[1]);
    }
  }
  
  // Track source type (cached vs live)
  if (output.includes('cached-only mode') || output.includes('circuit open')) {
    metrics.screener_cached_runs_total += 1;
  } else if (output.includes('http-trace:polygon')) {
    metrics.screener_live_runs_total += 1;  
  }
  
  // Track overall runs
  if (output.includes('[screener] wrote')) {
    metrics.screener_runs_total += 1;
  }
}

/**
 * Record discovery insertions from unified ingest
 */
function recordDiscoveryInserts(count) {
  metrics.discoveries_inserted_total += count;
}

/**
 * Record outcome labeling results
 */
function recordOutcomeLabeled(outcome) {
  const key = `labeler_labeled_total_${outcome}`;
  if (key in metrics) {
    metrics[key] += 1;
  }
}

/**
 * Update outcome totals from database query
 */
function updateOutcomeTotals() {
  try {
    const { getOutcomeStats } = require('../jobs/outcomeLabeler');
    const stats = getOutcomeStats();
    
    // Reset outcome counters
    metrics.outcomes_open_total = 0;
    metrics.outcomes_win_total = 0;
    metrics.outcomes_loss_total = 0;
    
    // Update from current database state
    for (const stat of stats) {
      if (stat.outcome === 'WIN' || stat.outcome === 'BIG_WIN') {
        metrics.outcomes_win_total += stat.count;
      } else if (stat.outcome === 'LOSS' || stat.outcome === 'BIG_LOSS') {
        metrics.outcomes_loss_total += stat.count;
      } else if (stat.outcome === 'NEUTRAL') {
        metrics.outcomes_open_total += stat.count;
      }
    }
  } catch (error) {
    console.warn('[prometheus] Failed to update outcome totals:', error.message);
  }
}

/**
 * Export metrics in Prometheus text format
 */
function getPrometheusMetrics() {
  const lines = [];
  
  // Add help text and type info
  lines.push('# HELP polygon_http_200_total Successful Polygon API requests');
  lines.push('# TYPE polygon_http_200_total counter');
  lines.push(`polygon_http_200_total ${metrics.polygon_http_200_total}`);
  
  lines.push('# HELP polygon_http_401_total Failed Polygon API requests (auth)');
  lines.push('# TYPE polygon_http_401_total counter');
  lines.push(`polygon_http_401_total ${metrics.polygon_http_401_total}`);
  
  lines.push('# HELP polygon_http_429_total Rate limited Polygon API requests');
  lines.push('# TYPE polygon_http_429_total counter');
  lines.push(`polygon_http_429_total ${metrics.polygon_http_429_total}`);
  
  lines.push('# HELP polygon_http_500_total Server error Polygon API requests');
  lines.push('# TYPE polygon_http_500_total counter');
  lines.push(`polygon_http_500_total ${metrics.polygon_http_500_total}`);
  
  lines.push('# HELP polygon_live_fail_total Failed live universe fetches');
  lines.push('# TYPE polygon_live_fail_total counter');  
  lines.push(`polygon_live_fail_total ${metrics.polygon_live_fail_total}`);
  
  lines.push('# HELP screener_runs_total Total screener executions');
  lines.push('# TYPE screener_runs_total counter');
  lines.push(`screener_runs_total ${metrics.screener_runs_total}`);
  
  lines.push('# HELP screener_cached_runs_total Screener runs using cached data');
  lines.push('# TYPE screener_cached_runs_total counter');
  lines.push(`screener_cached_runs_total ${metrics.screener_cached_runs_total}`);
  
  lines.push('# HELP screener_live_runs_total Screener runs using live API');
  lines.push('# TYPE screener_live_runs_total counter');
  lines.push(`screener_live_runs_total ${metrics.screener_live_runs_total}`);
  
  lines.push('# HELP discoveries_inserted_total Discoveries successfully inserted to database');
  lines.push('# TYPE discoveries_inserted_total counter');
  lines.push(`discoveries_inserted_total ${metrics.discoveries_inserted_total}`);
  
  // Outcome labeling metrics
  lines.push('# HELP labeler_labeled_total Discoveries labeled by outcome');
  lines.push('# TYPE labeler_labeled_total counter');
  lines.push(`labeler_labeled_total{outcome="BIG_WIN"} ${metrics.labeler_labeled_total_BIG_WIN}`);
  lines.push(`labeler_labeled_total{outcome="WIN"} ${metrics.labeler_labeled_total_WIN}`);
  lines.push(`labeler_labeled_total{outcome="NEUTRAL"} ${metrics.labeler_labeled_total_NEUTRAL}`);
  lines.push(`labeler_labeled_total{outcome="LOSS"} ${metrics.labeler_labeled_total_LOSS}`);
  lines.push(`labeler_labeled_total{outcome="BIG_LOSS"} ${metrics.labeler_labeled_total_BIG_LOSS}`);
  lines.push(`labeler_labeled_total{outcome="ERROR"} ${metrics.labeler_labeled_total_ERROR}`);
  lines.push(`labeler_labeled_total{outcome="INSUFFICIENT_DATA"} ${metrics.labeler_labeled_total_INSUFFICIENT_DATA}`);
  
  // Current outcome totals (updated dynamically)
  updateOutcomeTotals();
  lines.push('# HELP outcomes_open_total Current open (unlabeled) discoveries');
  lines.push('# TYPE outcomes_open_total gauge');
  lines.push(`outcomes_open_total ${metrics.outcomes_open_total}`);
  
  lines.push('# HELP outcomes_win_total Current total winning discoveries');
  lines.push('# TYPE outcomes_win_total gauge');
  lines.push(`outcomes_win_total ${metrics.outcomes_win_total}`);
  
  lines.push('# HELP outcomes_loss_total Current total losing discoveries');
  lines.push('# TYPE outcomes_loss_total gauge');
  lines.push(`outcomes_loss_total ${metrics.outcomes_loss_total}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Get raw metrics object for JSON API
 */
function getRawMetrics() {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
function resetMetrics() {
  for (const key in metrics) {
    metrics[key] = 0;
  }
}

module.exports = {
  parseScreenerMetrics,
  recordDiscoveryInserts,
  recordOutcomeLabeled,
  updateOutcomeTotals,
  getPrometheusMetrics,
  getRawMetrics,
  resetMetrics
};