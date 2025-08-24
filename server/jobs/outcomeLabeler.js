/**
 * Outcome Labeler - Daily job to calculate realized returns and label outcomes
 * Runs at 3:05 UTC daily to avoid market hours and allow settlement
 */

const { db } = require('../db/sqlite');
const { recordSuccess, recordFailure } = require('../services/health_monitor');

// Polygon API client for historical data
const polygon = require('../services/polygon');

/**
 * Calculate realized return for a discovery from entry to horizon
 */
async function calculateRealizedReturn(symbol, entryAt, horizonDate) {
  try {
    const entryDate = new Date(entryAt);
    const horizon = new Date(horizonDate);
    
    // Format dates for Polygon API (YYYY-MM-DD)
    const entryDateStr = entryDate.toISOString().split('T')[0];
    const horizonDateStr = horizon.toISOString().split('T')[0];
    
    console.log(`[labeler] Calculating return for ${symbol}: ${entryDateStr} → ${horizonDateStr}`);
    
    // Get historical bars for the period
    const bars = await polygon.getHistoricalBars(symbol, entryDateStr, horizonDateStr);
    
    if (!bars || bars.length < 2) {
      console.warn(`[labeler] Insufficient data for ${symbol}: ${bars?.length || 0} bars`);
      return { realized_return: null, outcome: 'insufficient_data' };
    }
    
    // Entry price is the close of the entry date
    // Exit price is the close of the horizon date
    const entryPrice = bars[0].c;
    const exitPrice = bars[bars.length - 1].c;
    
    const realizedReturn = ((exitPrice - entryPrice) / entryPrice) * 100;
    
    // Label outcome based on return thresholds
    let outcome;
    if (realizedReturn >= 15) {
      outcome = 'big_win';
    } else if (realizedReturn >= 5) {
      outcome = 'win'; 
    } else if (realizedReturn >= -5) {
      outcome = 'neutral';
    } else if (realizedReturn >= -15) {
      outcome = 'loss';
    } else {
      outcome = 'big_loss';
    }
    
    console.log(`[labeler] ${symbol}: ${realizedReturn.toFixed(2)}% → ${outcome}`);
    
    return {
      realized_return: Math.round(realizedReturn * 100) / 100, // Round to 2 decimals
      outcome
    };
    
  } catch (error) {
    console.error(`[labeler] Error calculating return for ${symbol}:`, error.message);
    return { realized_return: null, outcome: 'error' };
  }
}

/**
 * Main labeler function - processes all unlabeled discoveries past their horizon
 */
async function runOutcomeLabeler() {
  const startTime = Date.now();
  console.log('[labeler] 🏷️ Starting outcome labeling job...');
  
  try {
    const cutoff = new Date();
    
    // Get all discoveries that need labeling (past horizon, no outcome yet)
    const stmt = db.prepare(`
      SELECT id, symbol, price, entry_at, horizon_days, created_at
      FROM discoveries
      WHERE outcome IS NULL
        AND entry_at IS NOT NULL
        AND horizon_days IS NOT NULL
    `);
    
    const rows = stmt.all();
    console.log(`[labeler] Found ${rows.length} discoveries to process`);
    
    if (rows.length === 0) {
      console.log('[labeler] ✅ No discoveries need labeling');
      recordSuccess('outcome_labeler', { processed: 0, duration: Date.now() - startTime });
      return;
    }
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    const updateStmt = db.prepare(`
      UPDATE discoveries
      SET realized_return = ?, outcome = ?
      WHERE id = ?
    `);
    
    for (const row of rows) {
      try {
        // Check if horizon has passed
        const entryDate = new Date(row.entry_at || row.created_at);
        const horizon = new Date(entryDate);
        horizon.setDate(horizon.getDate() + (row.horizon_days || 7));
        
        if (cutoff < horizon) {
          skipped++;
          continue; // Still within horizon period
        }
        
        // Calculate realized return
        const { realized_return, outcome } = await calculateRealizedReturn(
          row.symbol, 
          row.entry_at || row.created_at,
          horizon
        );
        
        // Update database
        updateStmt.run(realized_return, outcome, row.id);
        processed++;
        
        // Record metrics
        try {
          const { recordOutcomeLabeled } = require('../services/prometheus_metrics');
          recordOutcomeLabeled(outcome);
        } catch (e) {
          // Metrics not critical for core functionality
        }
        
        // Rate limit to avoid API throttling
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`[labeler] Error processing ${row.symbol}:`, error.message);
        errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[labeler] ✅ Completed: processed=${processed}, skipped=${skipped}, errors=${errors} in ${duration}ms`);
    
    // Record health metrics
    recordSuccess('outcome_labeler', { 
      processed, 
      skipped, 
      errors, 
      duration 
    });
    
    return { processed, skipped, errors, duration };
    
  } catch (error) {
    console.error('[labeler] ❌ Labeler job failed:', error.message);
    recordFailure('outcome_labeler', error);
    throw error;
  }
}

/**
 * Initialize entry_at timestamps for existing discoveries that don't have them
 * This is a one-time migration helper
 */
function initializeEntryTimestamps() {
  console.log('[labeler] 🔄 Initializing entry timestamps for existing discoveries...');
  
  const updateStmt = db.prepare(`
    UPDATE discoveries 
    SET entry_at = created_at,
        horizon_days = COALESCE(horizon_days, 7)
    WHERE entry_at IS NULL
  `);
  
  const result = updateStmt.run();
  console.log(`[labeler] ✅ Initialized entry timestamps for ${result.changes} discoveries`);
  
  return result.changes;
}

/**
 * Get outcome statistics for API endpoints and telemetry
 */
function getOutcomeStats() {
  try {
    const stmt = db.prepare(`
      SELECT 
        outcome,
        COUNT(*) as count,
        AVG(realized_return) as avg_return,
        MIN(realized_return) as min_return,
        MAX(realized_return) as max_return
      FROM discoveries
      WHERE outcome IS NOT NULL
      GROUP BY outcome
      ORDER BY count DESC
    `);
    
    return stmt.all();
  } catch (error) {
    console.error('[labeler] Error getting outcome stats:', error.message);
    return [];
  }
}

/**
 * Get individual outcomes for detailed analysis
 */
function getOutcomeDetails(limit = 50) {
  try {
    const stmt = db.prepare(`
      SELECT 
        symbol, 
        outcome,
        realized_return,
        score,
        entry_at,
        horizon_days,
        created_at
      FROM discoveries
      WHERE outcome IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  } catch (error) {
    console.error('[labeler] Error getting outcome details:', error.message);
    return [];
  }
}

module.exports = {
  runOutcomeLabeler,
  initializeEntryTimestamps,
  calculateRealizedReturn,
  getOutcomeStats,
  getOutcomeDetails
};