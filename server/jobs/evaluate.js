const { getDecisionsByConfidence } = require('../db/sqlite');

/**
 * Generate learning summary of decisions bucketed by confidence
 * @param {number} days Number of days to look back (default 30)
 * @returns {Object} Summary statistics
 */
function generateLearningSummary(days = 30) {
  const since = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  try {
    const results = getDecisionsByConfidence.all({ since });
    
    // Transform results into confidence buckets
    const buckets = {};
    for (let conf = 0; conf <= 1.0; conf += 0.1) {
      buckets[conf.toFixed(1)] = {
        confidence: conf,
        count: 0,
        avg_t1_pnl: 0,
        avg_t5_pnl: 0,
        avg_t20_pnl: 0,
        win_rate_t1: 0,
        win_rate_t5: 0,
        win_rate_t20: 0
      };
    }
    
    // Fill in actual data
    results.forEach(row => {
      const bucket = row.confidence_bucket?.toFixed(1);
      if (bucket && buckets[bucket]) {
        buckets[bucket] = {
          confidence: parseFloat(bucket),
          count: row.count,
          avg_t1_pnl: row.avg_t1_pnl || 0,
          avg_t5_pnl: row.avg_t5_pnl || 0,
          avg_t20_pnl: row.avg_t20_pnl || 0,
          win_rate_t1: row.avg_t1_pnl > 0 ? 1 : 0,
          win_rate_t5: row.avg_t5_pnl > 0 ? 1 : 0,
          win_rate_t20: row.avg_t20_pnl > 0 ? 1 : 0
        };
      }
    });
    
    // Calculate overall statistics
    const totalDecisions = results.reduce((sum, r) => sum + r.count, 0);
    const avgPnL = totalDecisions > 0 
      ? results.reduce((sum, r) => sum + (r.avg_t20_pnl * r.count), 0) / totalDecisions
      : 0;
    
    // Find best performing confidence level
    let bestConfidence = null;
    let bestPnL = -Infinity;
    Object.values(buckets).forEach(b => {
      if (b.count > 0 && b.avg_t20_pnl > bestPnL) {
        bestPnL = b.avg_t20_pnl;
        bestConfidence = b.confidence;
      }
    });
    
    return {
      summary: {
        period_days: days,
        total_decisions: totalDecisions,
        avg_pnl_t20: avgPnL,
        best_confidence_level: bestConfidence,
        best_confidence_pnl: bestPnL,
        generated_at: new Date().toISOString()
      },
      buckets: Object.values(buckets).filter(b => b.count > 0),
      all_buckets: buckets
    };
  } catch (error) {
    console.error('Error generating learning summary:', error);
    return {
      summary: {
        period_days: days,
        total_decisions: 0,
        error: error.message,
        generated_at: new Date().toISOString()
      },
      buckets: [],
      all_buckets: {}
    };
  }
}

module.exports = {
  generateLearningSummary
};