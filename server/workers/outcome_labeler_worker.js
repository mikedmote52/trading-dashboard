/**
 * Outcome Labeler Worker - Scheduled daily outcome tracking
 * 
 * Runs at 3AM UTC daily to process matured discoveries
 * Labels wins/losses based on realized returns vs entry price
 */

const { runOutcomeLabeler } = require("../jobs/outcomeLabeler");

const CRON_SCHEDULE = process.env.OUTCOME_CRON_SCHEDULE || '0 3 * * *'; // 3 AM UTC daily
const ENABLED = process.env.OUTCOME_LABELER_ENABLED !== 'false';

let running = false;
let lastRun = { ts: null, results: null, error: null };

/**
 * Execute outcome labeling job
 */
async function tick() {
  if (running) {
    console.log('[outcome_worker] Already running, skipping...');
    return;
  }
  
  running = true;
  const startTime = Date.now();
  
  try {
    console.log('[outcome_worker] 🚀 Starting scheduled outcome labeling...');
    
    const results = await runOutcomeLabeler();
    
    lastRun = {
      ts: new Date().toISOString(),
      results,
      error: null
    };
    
    console.log(`[outcome_worker] ✅ Complete: processed ${results.processed} discoveries (${results.successes} successes, ${results.errors} errors)`);
    
    // Report to health monitor if available
    try {
      const { recordSuccess } = require("../services/health_monitor");
      recordSuccess('outcome_labeler', { 
        ...results, 
        duration: Date.now() - startTime 
      });
    } catch (e) {
      // Health monitor not critical
    }
    
  } catch (error) {
    lastRun = {
      ts: new Date().toISOString(),
      results: null,
      error: error.message
    };
    
    console.error('[outcome_worker] ❌ Error:', error.message);
    
    // Report failure to health monitor if available
    try {
      const { recordFailure } = require("../services/health_monitor");
      recordFailure('outcome_labeler', error);
    } catch (e) {
      // Health monitor not critical
    }
  } finally {
    running = false;
  }
}

/**
 * Start the outcome labeler worker with cron scheduling
 */
function startOutcomeLabelerWorker() {
  if (!ENABLED) {
    console.log('[outcome_worker] 📴 Outcome labeler disabled');
    return;
  }
  
  console.log(`[outcome_worker] 🕒 Starting outcome labeler with schedule: ${CRON_SCHEDULE}`);
  
  try {
    const cron = require('node-cron');
    
    // Schedule the job
    cron.schedule(CRON_SCHEDULE, () => {
      console.log('[outcome_worker] ⏰ Cron trigger - starting outcome labeling...');
      tick().catch(err => {
        console.error('[outcome_worker] ❌ Cron job error:', err.message);
      });
    }, {
      timezone: "UTC"
    });
    
    console.log('[outcome_worker] ✅ Cron job scheduled successfully');
    
    // Run once on startup if last run was more than 24 hours ago
    if (process.env.RUN_OUTCOME_ON_STARTUP === 'true') {
      console.log('[outcome_worker] 🚀 Running initial outcome labeling...');
      setTimeout(() => {
        tick().catch(err => {
          console.error('[outcome_worker] ❌ Startup run error:', err.message);
        });
      }, 5000); // Wait 5s for system to be ready
    }
    
  } catch (error) {
    console.error('[outcome_worker] ❌ Failed to initialize cron:', error.message);
    
    // Fallback to manual polling if cron fails
    console.log('[outcome_worker] 🔄 Falling back to polling every 24 hours...');
    setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
        tick().catch(err => {
          console.error('[outcome_worker] ❌ Polling job error:', err.message);
        });
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }
}

/**
 * Get last run status for health checks
 */
function getLastOutcomeRun() {
  return lastRun;
}

/**
 * Manual trigger for testing/admin
 */
async function triggerOutcomeLabeling() {
  console.log('[outcome_worker] 🔧 Manual trigger requested...');
  return await tick();
}

module.exports = {
  startOutcomeLabelerWorker,
  getLastOutcomeRun,
  triggerOutcomeLabeling
};