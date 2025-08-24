/**
 * Enrichment worker - schedules component scoring enrichment
 * Runs every 3 minutes to keep composite scores fresh
 */

// Never run on web dyno
if (process.env.DIRECT_WORKER_ENABLED !== 'true') {
  module.exports = class EnrichmentWorker { 
    start() { 
      console.warn('[enrichment_worker] disabled on web'); 
    } 
  };
  return;
}

const enrichLatest = require('../jobs/enrich_components');

class EnrichmentWorker {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.lastRun = null;
    this.runCount = 0;
  }

  start() {
    if (this.intervalId) {
      console.log('[enrichment_worker] Already running');
      return;
    }

    console.log('[enrichment_worker] 🎯 Starting enrichment worker (every 3 minutes)');
    
    // Run immediately on startup
    this.runEnrichment();
    
    // Schedule every 3 minutes (180,000ms)
    this.intervalId = setInterval(() => {
      this.runEnrichment();
    }, 180000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[enrichment_worker] ⏸️ Stopped enrichment worker');
    }
  }

  async runEnrichment() {
    if (this.isRunning) {
      console.log('[enrichment_worker] ⏭️ Skipping run - already in progress');
      return;
    }

    this.isRunning = true;
    this.runCount++;
    
    try {
      console.log(`[enrichment_worker] 🚀 Starting enrichment run #${this.runCount}`);
      const startTime = Date.now();
      
      // Enrich last 80 discoveries
      await enrichLatest(80);
      
      const duration = Date.now() - startTime;
      this.lastRun = new Date();
      
      console.log(`[enrichment_worker] ✅ Enrichment run #${this.runCount} completed in ${duration}ms`);
      
    } catch (error) {
      console.error('[enrichment_worker] ❌ Enrichment run failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      runCount: this.runCount,
      lastRun: this.lastRun,
      nextRun: this.intervalId ? new Date(Date.now() + 180000) : null
    };
  }
}

module.exports = EnrichmentWorker;