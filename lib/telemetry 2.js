// Telemetry System for AlphaStack Discovery
// Track decisions, outcomes, and performance metrics

const fs = require('fs');
const path = require('path');

class TelemetryLogger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logDir = options.logDir || 'logs/telemetry';
    this.retentionDays = options.retentionDays || 90;
    
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  logDecision(data) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'decision',
      run_id: data.run_id,
      engine: data.engine || 'unknown',
      ticker: data.ticker,
      vigl_score: data.vigl_score,
      contender_score: data.contender_score,
      action: data.action,
      signals: data.signals || {},
      price: data.price,
      market_cap_tier: this.getMarketCapTier(data.price),
      ...data.metadata
    };

    this.writeLog('decisions', logEntry);
  }

  logOrder(data) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'order',
      run_id: data.run_id,
      ticker: data.ticker,
      order_type: data.order_type || 'buy',
      usd_amount: data.usd,
      shares: data.shares,
      price: data.price,
      tp1_pct: data.tp1_pct,
      tp2_pct: data.tp2_pct,
      sl_pct: data.sl_pct,
      order_id: data.order_id,
      position_id: data.position_id,
      source: data.source || 'discovery_ui'
    };

    this.writeLog('orders', logEntry);
  }

  logOutcome(data) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'outcome',
      ticker: data.ticker,
      position_id: data.position_id,
      entry_price: data.entry_price,
      current_price: data.current_price,
      return_pct: data.return_pct,
      max_runup: data.max_runup,
      max_drawdown: data.max_drawdown,
      days_held: data.days_held,
      status: data.status, // 'open', 'tp1', 'tp2', 'sl', 'manual_close'
      realized_pnl: data.realized_pnl
    };

    this.writeLog('outcomes', logEntry);
  }

  logContenders(data) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'contenders',
      run_id: data.run_id,
      engine: data.engine,
      contenders: data.contenders.map(c => ({
        ticker: c.ticker,
        score: c.score,
        contender_score: c.contender_score,
        rank: c.rank,
        is_new: c.is_new
      })),
      total_candidates: data.total_candidates,
      new_contenders_count: data.new_contenders_count
    };

    this.writeLog('contenders', logEntry);
  }

  logSystemMetrics(data) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'system_metrics',
      scan_duration_ms: data.scan_duration_ms,
      candidates_processed: data.candidates_processed,
      contenders_selected: data.contenders_selected,
      alphabet_diversity: data.alphabet_diversity,
      avg_score: data.avg_score,
      price_distribution: data.price_distribution,
      memory_usage: process.memoryUsage(),
      engine: data.engine
    };

    this.writeLog('system', logEntry);
  }

  writeLog(category, entry) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${category}_${date}.jsonl`;
    const filepath = path.join(this.logDir, filename);
    
    const logLine = JSON.stringify(entry) + '\\n';
    fs.appendFileSync(filepath, logLine);
  }

  getMarketCapTier(price) {
    if (price < 2) return 'ultra_micro';
    if (price < 5) return 'micro';
    if (price < 20) return 'small';
    return 'mid';
  }

  // Analysis methods
  async getPerformanceMetrics(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const decisions = await this.readLogs('decisions', cutoffDate);
    const outcomes = await this.readLogs('outcomes', cutoffDate);

    return this.calculatePerformanceMetrics(decisions, outcomes);
  }

  async readLogs(category, since = null) {
    const logs = [];
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.startsWith(`${category}_`) && f.endsWith('.jsonl'))
      .sort();

    for (const file of files) {
      const filepath = path.join(this.logDir, file);
      const content = fs.readFileSync(filepath, 'utf8');
      const entries = content.trim().split('\\n').filter(Boolean).map(JSON.parse);
      
      for (const entry of entries) {
        if (!since || new Date(entry.timestamp) >= since) {
          logs.push(entry);
        }
      }
    }

    return logs;
  }

  calculatePerformanceMetrics(decisions, outcomes) {
    // Match decisions to outcomes
    const positionMap = new Map();
    outcomes.forEach(outcome => {
      if (outcome.position_id) {
        positionMap.set(outcome.position_id, outcome);
      }
    });

    const matched = decisions.filter(d => d.action === 'BUY').map(decision => {
      const outcome = positionMap.get(decision.position_id);
      return { decision, outcome };
    });

    const completedPositions = matched.filter(m => m.outcome && m.outcome.status !== 'open');

    if (completedPositions.length === 0) {
      return { error: 'No completed positions found' };
    }

    // Calculate metrics
    const returns = completedPositions.map(p => p.outcome.return_pct);
    const hitRate = returns.filter(r => r > 0.2).length / returns.length; // >20% return
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const medianReturn = returns.sort()[Math.floor(returns.length / 2)];
    const maxDrawdowns = completedPositions.map(p => p.outcome.max_drawdown);
    const maxDrawdown = Math.min(...maxDrawdowns);

    return {
      totalPositions: completedPositions.length,
      hitRate,
      avgReturn,
      medianReturn,
      maxDrawdown,
      winRate: returns.filter(r => r > 0).length / returns.length,
      scoreDistribution: this.scoreDistribution(completedPositions.map(p => p.decision.vigl_score))
    };
  }

  scoreDistribution(scores) {
    const ranges = { '95-100': 0, '90-94': 0, '85-89': 0, '<85': 0 };
    scores.forEach(score => {
      if (score >= 95) ranges['95-100']++;
      else if (score >= 90) ranges['90-94']++;
      else if (score >= 85) ranges['85-89']++;
      else ranges['<85']++;
    });
    return ranges;
  }

  // Cleanup old logs
  cleanup() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
    
    const files = fs.readdirSync(this.logDir);
    files.forEach(file => {
      const filepath = path.join(this.logDir, file);
      const stats = fs.statSync(filepath);
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filepath);
        console.log(`🗑️ Cleaned up old telemetry log: ${file}`);
      }
    });
  }
}

module.exports = TelemetryLogger;