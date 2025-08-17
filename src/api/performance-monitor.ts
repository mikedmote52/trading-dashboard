/**
 * Performance Monitoring System
 * Real-time tracking, analytics, and alerting for AlphaStack API performance
 */

import { isEnabled } from '../config/feature-flags';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
}

export interface PerformanceAlert {
  id: string;
  metric: string;
  level: 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
  timestamp: Date;
  resolved?: Date;
}

export interface PerformanceSummary {
  timeRange: {
    start: Date;
    end: Date;
  };
  metrics: {
    apiResponseTime: {
      avg: number;
      min: number;
      max: number;
      p95: number;
      p99: number;
    };
    successRate: number;
    errorRate: number;
    requestsPerMinute: number;
    cacheHitRate: number;
    dataFreshness: number;
  };
  alerts: PerformanceAlert[];
  trends: {
    improving: string[];
    degrading: string[];
  };
}

interface MetricHistory {
  values: Array<{ value: number; timestamp: number }>;
  maxSize: number;
}

class MetricCalculator {
  static percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  static average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  static movingAverage(values: number[], windowSize: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = values.slice(start, i + 1);
      result.push(this.average(window));
    }
    return result;
  }

  static trend(values: number[]): 'improving' | 'degrading' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(-Math.min(10, values.length));
    const first = this.average(recent.slice(0, Math.ceil(recent.length / 2)));
    const last = this.average(recent.slice(Math.floor(recent.length / 2)));
    
    const changePercent = ((last - first) / first) * 100;
    
    if (Math.abs(changePercent) < 5) return 'stable';
    return changePercent > 0 ? 'degrading' : 'improving'; // For response time, lower is better
  }
}

export class PerformanceMonitor {
  private metrics = new Map<string, MetricHistory>();
  private thresholds = new Map<string, PerformanceThreshold>();
  private alerts = new Map<string, PerformanceAlert>();
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertCallbacks = new Set<(alert: PerformanceAlert) => void>();

  constructor() {
    this.initializeThresholds();
    this.initializeMetrics();
  }

  private initializeThresholds(): void {
    const defaultThresholds: PerformanceThreshold[] = [
      { metric: 'api_response_time', warning: 2000, critical: 5000, unit: 'ms' },
      { metric: 'error_rate', warning: 5, critical: 15, unit: '%' },
      { metric: 'success_rate', warning: 95, critical: 85, unit: '%' },
      { metric: 'cache_hit_rate', warning: 70, critical: 50, unit: '%' },
      { metric: 'requests_per_minute', warning: 100, critical: 200, unit: 'req/min' },
      { metric: 'data_freshness', warning: 60000, critical: 300000, unit: 'ms' }
    ];

    defaultThresholds.forEach(threshold => {
      this.thresholds.set(threshold.metric, threshold);
    });
  }

  private initializeMetrics(): void {
    const metricNames = [
      'api_response_time',
      'api_success',
      'api_error',
      'cache_hit',
      'cache_miss',
      'request_count',
      'data_freshness',
      'ui_render_time',
      'memory_usage'
    ];

    metricNames.forEach(name => {
      this.metrics.set(name, { values: [], maxSize: 1000 });
    });
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    if (!isEnabled('PERFORMANCE_MONITORING')) return;

    const history = this.metrics.get(name);
    if (!history) {
      this.metrics.set(name, { values: [], maxSize: 1000 });
    }

    const metric = this.metrics.get(name)!;
    metric.values.push({
      value,
      timestamp: Date.now()
    });

    // Maintain size limit
    if (metric.values.length > metric.maxSize) {
      metric.values = metric.values.slice(-metric.maxSize);
    }

    // Check for threshold violations
    this.checkThresholds(name, value);

    if (isEnabled('DEBUG_MODE')) {
      console.debug(`📊 Performance: ${name} = ${value}${this.getUnit(name)}`, tags);
    }
  }

  /**
   * Record API request timing
   */
  recordApiRequest(
    duration: number,
    success: boolean,
    endpoint?: string,
    cacheHit: boolean = false
  ): void {
    this.recordMetric('api_response_time', duration, { endpoint });
    this.recordMetric(success ? 'api_success' : 'api_error', 1, { endpoint });
    this.recordMetric(cacheHit ? 'cache_hit' : 'cache_miss', 1, { endpoint });
    this.recordMetric('request_count', 1, { endpoint, cached: cacheHit.toString() });
  }

  /**
   * Record UI rendering performance
   */
  recordRenderTime(componentName: string, duration: number): void {
    this.recordMetric('ui_render_time', duration, { component: componentName });
  }

  /**
   * Record data freshness (age of data being displayed)
   */
  recordDataFreshness(ageMs: number): void {
    this.recordMetric('data_freshness', ageMs);
  }

  private checkThresholds(metricName: string, value: number): void {
    const threshold = this.thresholds.get(metricName);
    if (!threshold) return;

    const existingAlert = this.alerts.get(metricName);
    
    // Check if metric is in violation
    let violationLevel: 'warning' | 'critical' | null = null;
    
    if (value >= threshold.critical) {
      violationLevel = 'critical';
    } else if (value >= threshold.warning) {
      violationLevel = 'warning';
    }

    if (violationLevel) {
      // Create or update alert
      if (!existingAlert || existingAlert.level !== violationLevel) {
        const alert: PerformanceAlert = {
          id: `${metricName}-${Date.now()}`,
          metric: metricName,
          level: violationLevel,
          value,
          threshold: violationLevel === 'critical' ? threshold.critical : threshold.warning,
          message: this.createAlertMessage(metricName, value, violationLevel, threshold),
          timestamp: new Date()
        };

        this.alerts.set(metricName, alert);
        this.notifyAlertCallbacks(alert);
      }
    } else if (existingAlert && !existingAlert.resolved) {
      // Resolve existing alert
      existingAlert.resolved = new Date();
      this.notifyAlertCallbacks(existingAlert);
    }
  }

  private createAlertMessage(
    metricName: string,
    value: number,
    level: 'warning' | 'critical',
    threshold: PerformanceThreshold
  ): string {
    const levelEmoji = level === 'critical' ? '🚨' : '⚠️';
    const unit = threshold.unit;
    const thresholdValue = level === 'critical' ? threshold.critical : threshold.warning;
    
    return `${levelEmoji} ${metricName.replace(/_/g, ' ')} is ${value}${unit} (threshold: ${thresholdValue}${unit})`;
  }

  private notifyAlertCallbacks(alert: PerformanceAlert): void {
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        console.error('Error in alert callback:', error);
      }
    });
  }

  private getUnit(metricName: string): string {
    const threshold = this.thresholds.get(metricName);
    return threshold ? threshold.unit : '';
  }

  /**
   * Get current performance summary
   */
  getSummary(timeRangeMs: number = 300000): PerformanceSummary {
    const now = Date.now();
    const start = new Date(now - timeRangeMs);
    const end = new Date(now);

    // Filter metrics within time range
    const getRecentValues = (metricName: string): number[] => {
      const history = this.metrics.get(metricName);
      if (!history) return [];
      
      return history.values
        .filter(v => v.timestamp >= start.getTime())
        .map(v => v.value);
    };

    const responseTimeValues = getRecentValues('api_response_time');
    const successValues = getRecentValues('api_success');
    const errorValues = getRecentValues('api_error');
    const cacheHits = getRecentValues('cache_hit');
    const cacheMisses = getRecentValues('cache_miss');
    const requestCounts = getRecentValues('request_count');
    const dataFreshnessValues = getRecentValues('data_freshness');

    const totalRequests = successValues.length + errorValues.length;
    const totalCacheRequests = cacheHits.length + cacheMisses.length;

    return {
      timeRange: { start, end },
      metrics: {
        apiResponseTime: {
          avg: Math.round(MetricCalculator.average(responseTimeValues)),
          min: Math.round(Math.min(...responseTimeValues) || 0),
          max: Math.round(Math.max(...responseTimeValues) || 0),
          p95: Math.round(MetricCalculator.percentile(responseTimeValues, 95)),
          p99: Math.round(MetricCalculator.percentile(responseTimeValues, 99))
        },
        successRate: totalRequests > 0 ? Math.round((successValues.length / totalRequests) * 100) : 100,
        errorRate: totalRequests > 0 ? Math.round((errorValues.length / totalRequests) * 100) : 0,
        requestsPerMinute: Math.round((requestCounts.length / timeRangeMs) * 60000),
        cacheHitRate: totalCacheRequests > 0 ? Math.round((cacheHits.length / totalCacheRequests) * 100) : 0,
        dataFreshness: Math.round(MetricCalculator.average(dataFreshnessValues))
      },
      alerts: Array.from(this.alerts.values()).filter(alert => !alert.resolved),
      trends: this.calculateTrends()
    };
  }

  private calculateTrends(): { improving: string[]; degrading: string[] } {
    const improving: string[] = [];
    const degrading: string[] = [];

    this.metrics.forEach((history, metricName) => {
      if (history.values.length < 10) return;

      const values = history.values.slice(-20).map(v => v.value);
      const trend = MetricCalculator.trend(values);

      if (trend === 'improving') {
        improving.push(metricName);
      } else if (trend === 'degrading') {
        degrading.push(metricName);
      }
    });

    return { improving, degrading };
  }

  /**
   * Subscribe to performance alerts
   */
  onAlert(callback: (alert: PerformanceAlert) => void): () => void {
    this.alertCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.alertCallbacks.delete(callback);
    };
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    console.log('📊 Performance monitoring started');
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('📊 Performance monitoring stopped');
  }

  private collectSystemMetrics(): void {
    // Memory usage (if available)
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      this.recordMetric('memory_usage', memory.usedJSHeapSize / 1024 / 1024); // MB
    }

    // Connection status
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      this.recordMetric('connection_status', navigator.onLine ? 1 : 0);
    }
  }

  /**
   * Get detailed metric history
   */
  getMetricHistory(metricName: string, timeRangeMs: number = 3600000): Array<{ value: number; timestamp: Date }> {
    const history = this.metrics.get(metricName);
    if (!history) return [];

    const cutoff = Date.now() - timeRangeMs;
    return history.values
      .filter(v => v.timestamp >= cutoff)
      .map(v => ({ value: v.value, timestamp: new Date(v.timestamp) }));
  }

  /**
   * Update performance thresholds
   */
  updateThreshold(metricName: string, threshold: Partial<PerformanceThreshold>): void {
    const existing = this.thresholds.get(metricName);
    if (existing) {
      this.thresholds.set(metricName, { ...existing, ...threshold });
    }
  }

  /**
   * Clear all metrics and alerts
   */
  reset(): void {
    this.metrics.clear();
    this.alerts.clear();
    this.initializeMetrics();
  }

  /**
   * Export performance data for analysis
   */
  exportData(): {
    metrics: Record<string, Array<{ value: number; timestamp: number }>>;
    alerts: PerformanceAlert[];
    thresholds: Record<string, PerformanceThreshold>;
  } {
    const metricsData: Record<string, Array<{ value: number; timestamp: number }>> = {};
    
    this.metrics.forEach((history, name) => {
      metricsData[name] = [...history.values];
    });

    return {
      metrics: metricsData,
      alerts: Array.from(this.alerts.values()),
      thresholds: Object.fromEntries(this.thresholds)
    };
  }

  /**
   * Get real-time health score (0-100)
   */
  getHealthScore(): number {
    const summary = this.getSummary(300000); // Last 5 minutes
    
    let score = 100;
    
    // Response time impact
    if (summary.metrics.apiResponseTime.avg > 2000) score -= 20;
    else if (summary.metrics.apiResponseTime.avg > 1000) score -= 10;
    
    // Error rate impact
    score -= summary.metrics.errorRate * 2;
    
    // Success rate impact
    if (summary.metrics.successRate < 95) score -= (95 - summary.metrics.successRate);
    
    // Active alerts impact
    const criticalAlerts = summary.alerts.filter(a => a.level === 'critical').length;
    const warningAlerts = summary.alerts.filter(a => a.level === 'warning').length;
    
    score -= (criticalAlerts * 15) + (warningAlerts * 5);
    
    return Math.max(0, Math.min(100, score));
  }
}

// Singleton instance for global use
export const performanceMonitor = new PerformanceMonitor();

// Auto-start monitoring if enabled
if (isEnabled('PERFORMANCE_MONITORING')) {
  performanceMonitor.startMonitoring();
}