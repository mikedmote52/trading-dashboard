/**
 * Health monitor - prevents UI from going dark
 * Monitors contenders endpoint and triggers screener+enrichment if empty
 */

const { runScreenerSingleton } = require('../lib/screenerSingleton');
const enrichLatest = require('../jobs/enrich_components');

class HealthMonitor {
  constructor() {
    this.intervalId = null;
    this.lastCheck = null;
    this.consecutiveEmptyCount = 0;
    this.alertThreshold = 3; // 3 consecutive empty checks (15 minutes)
  }

  start() {
    if (this.intervalId) {
      console.log('[health_monitor] Already running');
      return;
    }

    console.log('[health_monitor] 🩺 Starting health monitor (every 5 minutes)');
    
    // Schedule every 5 minutes (300,000ms)
    this.intervalId = setInterval(() => {
      this.checkHealth();
    }, 300000);

    // Run initial check after 1 minute
    setTimeout(() => this.checkHealth(), 60000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[health_monitor] ⏸️ Stopped health monitor');
    }
  }

  async checkHealth() {
    this.lastCheck = new Date();

    try {
      const base = process.env.WEB_BASE || 'http://localhost:3005';
      
      // Use dynamic import for fetch
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(`${base}/api/discovery/contenders`);
      const data = await response.json();

      if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        this.consecutiveEmptyCount++;
        console.warn(`[health_monitor] ⚠️ Contenders empty (${this.consecutiveEmptyCount}/${this.alertThreshold})`);

        if (this.consecutiveEmptyCount >= this.alertThreshold) {
          console.warn('[health_monitor] 🚨 Triggering recovery: screener + enrichment');
          await this.triggerRecovery();
          this.consecutiveEmptyCount = 0; // Reset after recovery attempt
        }
      } else {
        this.consecutiveEmptyCount = 0;
        console.log(`[health_monitor] ✅ Health check passed: ${data.items.length} contenders`);
      }

    } catch (error) {
      console.error('[health_monitor] ❌ Health check failed:', error.message);
      this.consecutiveEmptyCount++;
    }
  }

  async triggerRecovery() {
    try {
      console.log('[health_monitor] 🔄 Starting recovery sequence...');
      
      // 1. Trigger screener to get fresh discoveries
      const screenerResult = await runScreenerSingleton({
        caller: 'health_monitor',
        limit: 20,
        budgetMs: 15000,
        jsonOut: '/tmp/health_recovery.json'
      });
      
      console.log(`[health_monitor] ✅ Screener completed: code=${screenerResult.code}, duration=${screenerResult.durationMs}ms`);
      
      // 2. Run enrichment on latest discoveries
      await enrichLatest(100);
      
      console.log('[health_monitor] ✅ Recovery sequence completed');
      
    } catch (error) {
      console.error('[health_monitor] ❌ Recovery sequence failed:', error.message);
    }
  }

  getStatus() {
    return {
      lastCheck: this.lastCheck,
      consecutiveEmptyCount: this.consecutiveEmptyCount,
      alertThreshold: this.alertThreshold,
      nextCheck: this.intervalId ? new Date(Date.now() + 300000) : null
    };
  }
}

module.exports = HealthMonitor;