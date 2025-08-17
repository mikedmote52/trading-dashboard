/**
 * Enhanced AlphaStack API Integration
 * Central export point for all fault-tolerant API components
 */

// Core API components
export { AlphaStackClient, alphaStackClient } from './alphastack-client';
export { ErrorHandler, errorHandler, ErrorType, ErrorSeverity } from './error-handler';
export { PerformanceMonitor, performanceMonitor } from './performance-monitor';
export { RealTimeDataManager, realTimeManager, createRealTimeManager } from './realtime-manager';

// Enhanced hooks
export { 
  useEnhancedAlphaStackData,
  useAlphaStackHealth,
  useAlphaStackAlerts
} from '../hooks/useEnhancedAlphaStackData';

// Legacy hook (for backward compatibility)
export { useAlphaStackData } from '../hooks/useAlphaStackData';

// Type exports
export type { 
  ErrorContext,
  RecoveryStrategy,
  PerformanceMetric,
  PerformanceThreshold,
  PerformanceAlert,
  PerformanceSummary,
  ConnectionState,
  UpdateStrategy,
  RealTimeConfig,
  DataUpdate,
  ConnectionMetrics,
  EnhancedUseAlphaStackDataOptions,
  EnhancedAlphaStackDataReturn
} from './error-handler';

/**
 * Quick setup function for standard AlphaStack integration
 */
export function setupAlphaStackAPI(config?: {
  enableRealTime?: boolean;
  enablePerformanceMonitoring?: boolean;
  enableErrorRecovery?: boolean;
  pollingInterval?: number;
}): {
  client: AlphaStackClient;
  realTimeManager: RealTimeDataManager;
  performanceMonitor: PerformanceMonitor;
  errorHandler: ErrorHandler;
} {
  const {
    enableRealTime = true,
    enablePerformanceMonitoring = true,
    enableErrorRecovery = true,
    pollingInterval = 30000
  } = config || {};

  // Configure real-time manager
  if (enableRealTime) {
    realTimeManager.updateConfig({
      pollingInterval,
      enableBackgroundRefresh: true,
      visibilityOptimization: true
    });
  }

  // Start performance monitoring
  if (enablePerformanceMonitoring) {
    performanceMonitor.startMonitoring();
  }

  return {
    client: alphaStackClient,
    realTimeManager,
    performanceMonitor,
    errorHandler
  };
}

/**
 * Health check function for the entire API system
 */
export async function healthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    api: { healthy: boolean; responseTime: number };
    errorHandler: { status: string; totalErrors: number };
    performanceMonitor: { score: number; alerts: number };
    realTimeManager: { connected: boolean; updates: number };
  };
  timestamp: Date;
}> {
  const timestamp = new Date();
  
  // API health check
  const apiHealth = await alphaStackClient.healthCheck();
  
  // Error handler status
  const errorStats = errorHandler.getErrorStats();
  const systemStatus = errorHandler.getSystemStatus();
  
  // Performance monitor status
  const healthScore = performanceMonitor.getHealthScore();
  const summary = performanceMonitor.getSummary(300000);
  
  // Real-time manager status
  const rtMetrics = realTimeManager.getMetrics();
  
  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  if (!apiHealth.healthy || healthScore < 70 || systemStatus.status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (healthScore < 85 || systemStatus.status === 'degraded' || summary.alerts.length > 0) {
    overallStatus = 'degraded';
  }
  
  return {
    status: overallStatus,
    components: {
      api: {
        healthy: apiHealth.healthy,
        responseTime: apiHealth.responseTime
      },
      errorHandler: {
        status: systemStatus.status,
        totalErrors: errorStats.totalErrors
      },
      performanceMonitor: {
        score: healthScore,
        alerts: summary.alerts.length
      },
      realTimeManager: {
        connected: rtMetrics.state === 'connected',
        updates: rtMetrics.updateCount
      }
    },
    timestamp
  };
}

/**
 * Emergency reset function for critical system issues
 */
export async function emergencyReset(): Promise<void> {
  console.warn('🚨 Performing emergency reset of AlphaStack API system');
  
  // Stop real-time manager
  await realTimeManager.stop();
  
  // Reset all components
  alphaStackClient.reset();
  alphaStackClient.resetCircuitBreaker();
  errorHandler.clearHistory();
  performanceMonitor.reset();
  realTimeManager.reset();
  
  // Restart real-time manager
  await realTimeManager.start();
  
  console.log('✅ Emergency reset completed');
}

/**
 * Export configuration for feature flags integration
 */
export const API_FEATURE_FLAGS = {
  ENHANCED_ERROR_HANDLING: 'V3_ERROR_BOUNDARIES',
  PERFORMANCE_MONITORING: 'PERFORMANCE_MONITORING',
  REAL_TIME_UPDATES: 'V3_REAL_TIME_UPDATES',
  API_CACHING: 'V3_API_CACHING',
  CIRCUIT_BREAKER: 'CIRCUIT_BREAKER'
} as const;