// Prometheus Metrics Service - Feature 3: Advanced monitoring
const os = require('os');
const fs = require('fs');
const path = require('path');

class MetricsService {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
    this.labels = new Map();
    
    // Initialize core metrics
    this.initializeCoreMetrics();
    
    // Start collection intervals
    this.startMetricsCollection();
    
    console.log('📊 Prometheus metrics service initialized');
  }
  
  initializeCoreMetrics() {
    // HTTP request metrics
    this.registerCounter('http_requests_total', 'Total HTTP requests', ['method', 'path', 'status']);
    this.registerHistogram('http_request_duration_ms', 'HTTP request duration in milliseconds', ['method', 'path']);
    
    // Trading metrics
    this.registerCounter('trades_total', 'Total trades executed', ['symbol', 'action', 'success']);
    this.registerHistogram('trade_execution_duration_ms', 'Trade execution duration', ['symbol']);
    this.registerGauge('trade_success_rate', 'Trade success rate percentage');
    
    // Discovery metrics
    this.registerCounter('discoveries_total', 'Total discoveries found', ['engine', 'action']);
    this.registerGauge('discovery_score_avg', 'Average discovery score');
    this.registerGauge('discovery_count_current', 'Current number of discoveries');
    this.registerHistogram('discovery_scan_duration_ms', 'Discovery scan duration', ['engine']);
    
    // Cache metrics
    this.registerCounter('cache_operations_total', 'Total cache operations', ['operation', 'result']);
    this.registerGauge('cache_hit_rate', 'Cache hit rate percentage');
    this.registerGauge('cache_size_bytes', 'Cache size in bytes');
    
    // System metrics
    this.registerGauge('system_memory_usage_bytes', 'System memory usage');
    this.registerGauge('system_cpu_usage_percent', 'System CPU usage percentage');
    this.registerGauge('system_load_average', 'System load average');
    this.registerGauge('nodejs_heap_used_bytes', 'Node.js heap used');
    this.registerGauge('nodejs_heap_total_bytes', 'Node.js heap total');
    
    // Database metrics
    this.registerCounter('database_queries_total', 'Total database queries', ['operation']);
    this.registerHistogram('database_query_duration_ms', 'Database query duration', ['operation']);
    this.registerGauge('database_connections_active', 'Active database connections');
    
    // API metrics
    this.registerCounter('api_calls_total', 'Total external API calls', ['provider', 'endpoint', 'status']);
    this.registerHistogram('api_call_duration_ms', 'External API call duration', ['provider']);
    this.registerGauge('api_rate_limit_remaining', 'API rate limit remaining', ['provider']);
  }
  
  registerCounter(name, help, labels = []) {
    this.counters.set(name, { value: 0, help, labels });
  }
  
  registerGauge(name, help, labels = []) {
    this.gauges.set(name, { value: 0, help, labels });
  }
  
  registerHistogram(name, help, labels = [], buckets = [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10, 30, 50, 70, 100, 300, 500, 700, 1000, 3000, 5000, 7000, 10000]) {
    this.histograms.set(name, { 
      buckets: new Map(), 
      sum: 0, 
      count: 0, 
      help, 
      labels,
      bucketLimits: buckets 
    });
    
    // Initialize buckets
    const histogram = this.histograms.get(name);
    buckets.forEach(bucket => {
      histogram.buckets.set(bucket, 0);
    });
    histogram.buckets.set('+Inf', 0);
  }
  
  incrementCounter(name, labels = {}) {
    const counter = this.counters.get(name);
    if (counter) {
      counter.value++;
      this.setLabels(name, labels);
    }
  }
  
  setGauge(name, value, labels = {}) {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.value = value;
      this.setLabels(name, labels);
    }
  }
  
  observeHistogram(name, value, labels = {}) {
    const histogram = this.histograms.get(name);
    if (histogram) {
      histogram.sum += value;
      histogram.count++;
      
      // Update buckets
      histogram.bucketLimits.forEach(bucket => {
        if (value <= bucket) {
          histogram.buckets.set(bucket, histogram.buckets.get(bucket) + 1);
        }
      });
      histogram.buckets.set('+Inf', histogram.buckets.get('+Inf') + 1);
      
      this.setLabels(name, labels);
    }
  }
  
  setLabels(metricName, labels) {
    if (!this.labels.has(metricName)) {
      this.labels.set(metricName, new Set());
    }
    this.labels.get(metricName).add(JSON.stringify(labels));
  }
  
  startMetricsCollection() {
    // Collect system metrics every 15 seconds
    this.systemMetricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 15000);
    
    // Collect discovery metrics every 30 seconds
    this.discoveryMetricsInterval = setInterval(() => {
      this.collectDiscoveryMetrics();
    }, 30000);
    
    // Collect initial metrics
    this.collectSystemMetrics();
    this.collectDiscoveryMetrics();
  }
  
  collectSystemMetrics() {
    try {
      // Memory metrics
      const memUsage = process.memoryUsage();
      this.setGauge('nodejs_heap_used_bytes', memUsage.heapUsed);
      this.setGauge('nodejs_heap_total_bytes', memUsage.heapTotal);
      this.setGauge('system_memory_usage_bytes', os.totalmem() - os.freemem());
      
      // CPU metrics
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      
      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const usage = 100 - ~~(100 * idle / total);
      
      this.setGauge('system_cpu_usage_percent', usage);
      this.setGauge('system_load_average', os.loadavg()[0]);
      
    } catch (error) {
      console.error('❌ Error collecting system metrics:', error.message);
    }
  }
  
  async collectDiscoveryMetrics() {
    try {
      const db = require('../db/sqlite');
      
      // Get discovery counts by action
      const actionCounts = db.db.prepare(`
        SELECT action, COUNT(*) as count, AVG(score) as avg_score
        FROM discoveries 
        WHERE action IS NOT NULL 
        AND created_at > datetime('now', '-1 hour')
        GROUP BY action
      `).all();
      
      let totalDiscoveries = 0;
      let totalScore = 0;
      let totalCount = 0;
      
      actionCounts.forEach(row => {
        totalDiscoveries += row.count;
        totalScore += row.avg_score * row.count;
        totalCount += row.count;
        
        this.setGauge('discovery_count_current', row.count, { action: row.action });
      });
      
      if (totalCount > 0) {
        this.setGauge('discovery_score_avg', totalScore / totalCount);
      }
      this.setGauge('discovery_count_current', totalDiscoveries);
      
    } catch (error) {
      console.error('❌ Error collecting discovery metrics:', error.message);
    }
  }
  
  // HTTP request tracking middleware
  getExpressMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const labels = {
          method: req.method,
          path: this.sanitizePath(req.path),
          status: res.statusCode.toString()
        };
        
        this.incrementCounter('http_requests_total', labels);
        this.observeHistogram('http_request_duration_ms', duration, {
          method: req.method,
          path: this.sanitizePath(req.path)
        });
      });
      
      next();
    };
  }
  
  sanitizePath(path) {
    // Replace dynamic path segments with placeholders
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9]{24}/g, '/:id')
      .replace(/\?.*$/, '');
  }
  
  // Track trade execution
  trackTrade(symbol, action, success, duration) {
    this.incrementCounter('trades_total', { symbol, action, success: success.toString() });
    this.observeHistogram('trade_execution_duration_ms', duration, { symbol });
  }
  
  // Track discovery scans
  trackDiscoveryScan(engine, duration, count) {
    this.observeHistogram('discovery_scan_duration_ms', duration, { engine });
    this.incrementCounter('discoveries_total', { engine, count: count.toString() });
  }
  
  // Track cache operations
  trackCacheOperation(operation, result) {
    this.incrementCounter('cache_operations_total', { operation, result });
  }
  
  // Track database operations
  trackDatabaseQuery(operation, duration) {
    this.incrementCounter('database_queries_total', { operation });
    this.observeHistogram('database_query_duration_ms', duration, { operation });
  }
  
  // Track API calls
  trackApiCall(provider, endpoint, status, duration) {
    this.incrementCounter('api_calls_total', { provider, endpoint, status: status.toString() });
    this.observeHistogram('api_call_duration_ms', duration, { provider });
  }
  
  // Export metrics in Prometheus format
  exportPrometheusMetrics() {
    let output = '';
    
    // Export counters
    for (const [name, counter] of this.counters) {
      output += `# HELP ${name} ${counter.help}\n`;
      output += `# TYPE ${name} counter\n`;
      
      if (this.labels.has(name)) {
        for (const labelSet of this.labels.get(name)) {
          const labels = JSON.parse(labelSet);
          const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
          output += `${name}{${labelStr}} ${counter.value}\n`;
        }
      } else {
        output += `${name} ${counter.value}\n`;
      }
      output += '\n';
    }
    
    // Export gauges
    for (const [name, gauge] of this.gauges) {
      output += `# HELP ${name} ${gauge.help}\n`;
      output += `# TYPE ${name} gauge\n`;
      
      if (this.labels.has(name)) {
        for (const labelSet of this.labels.get(name)) {
          const labels = JSON.parse(labelSet);
          const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
          output += `${name}{${labelStr}} ${gauge.value}\n`;
        }
      } else {
        output += `${name} ${gauge.value}\n`;
      }
      output += '\n';
    }
    
    // Export histograms
    for (const [name, histogram] of this.histograms) {
      output += `# HELP ${name} ${histogram.help}\n`;
      output += `# TYPE ${name} histogram\n`;
      
      // Export buckets
      for (const [bucket, count] of histogram.buckets) {
        if (this.labels.has(name)) {
          for (const labelSet of this.labels.get(name)) {
            const labels = JSON.parse(labelSet);
            const labelStr = Object.entries(labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',');
            output += `${name}_bucket{${labelStr},le="${bucket}"} ${count}\n`;
          }
        } else {
          output += `${name}_bucket{le="${bucket}"} ${count}\n`;
        }
      }
      
      // Export sum and count
      if (this.labels.has(name)) {
        for (const labelSet of this.labels.get(name)) {
          const labels = JSON.parse(labelSet);
          const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
          output += `${name}_sum{${labelStr}} ${histogram.sum}\n`;
          output += `${name}_count{${labelStr}} ${histogram.count}\n`;
        }
      } else {
        output += `${name}_sum ${histogram.sum}\n`;
        output += `${name}_count ${histogram.count}\n`;
      }
      output += '\n';
    }
    
    return output;
  }
  
  // Get metrics as JSON for debugging
  getMetricsJSON() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([name, hist]) => [
          name,
          {
            buckets: Object.fromEntries(hist.buckets),
            sum: hist.sum,
            count: hist.count,
            help: hist.help
          }
        ])
      ),
      timestamp: new Date().toISOString()
    };
  }
  
  destroy() {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }
    if (this.discoveryMetricsInterval) {
      clearInterval(this.discoveryMetricsInterval);
    }
  }
}

module.exports = MetricsService;