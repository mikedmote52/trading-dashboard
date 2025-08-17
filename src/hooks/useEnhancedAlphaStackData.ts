/**
 * Enhanced AlphaStack Data Hook
 * Integrates fault-tolerant API client, error handling, performance monitoring, and real-time updates
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type {
  AlphaStackCandidate,
  AlphaStackResponse,
  AlphaStackStats,
  UseAlphaStackDataReturn,
  ApiState,
  PerformanceMetrics
} from '../types/alphastack';

import { alphaStackClient } from '../api/alphastack-client';
import { errorHandler, type ErrorContext } from '../api/error-handler';
import { performanceMonitor } from '../api/performance-monitor';
import { realTimeManager, type DataUpdate, type ConnectionState } from '../api/realtime-manager';
import { isEnabled } from '../config/feature-flags';

export interface EnhancedUseAlphaStackDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  cacheEnabled?: boolean;
  realTimeUpdates?: boolean;
  errorRecovery?: boolean;
  performanceTracking?: boolean;
  backgroundRefresh?: boolean;
  visibilityOptimization?: boolean;
  maxRetries?: number;
  fallbackToCache?: boolean;
}

export interface EnhancedAlphaStackDataReturn extends UseAlphaStackDataReturn {
  // Enhanced state
  connectionState: ConnectionState;
  errorContext: ErrorContext | null;
  healthScore: number;
  
  // Enhanced metrics
  performanceMetrics: {
    responseTime: number;
    successRate: number;
    errorRate: number;
    cacheHitRate: number;
  };
  
  // Enhanced controls
  retry: () => Promise<void>;
  resetConnection: () => Promise<void>;
  clearErrors: () => void;
  updateConfig: (config: Partial<EnhancedUseAlphaStackDataOptions>) => void;
  
  // System status
  systemStatus: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    lastError?: Date;
  };
}

interface EnhancedApiState extends ApiState {
  connectionState: ConnectionState;
  errorContext: ErrorContext | null;
  lastDataUpdate: Date | null;
  isRealTimeActive: boolean;
}

/**
 * Enhanced hook for AlphaStack data with full fault tolerance
 */
export const useEnhancedAlphaStackData = (
  options: EnhancedUseAlphaStackDataOptions = {}
): EnhancedAlphaStackDataReturn => {
  const {
    autoRefresh = true,
    refreshInterval = 30000,
    cacheEnabled = isEnabled('V3_API_CACHING'),
    realTimeUpdates = isEnabled('V3_REAL_TIME_UPDATES'),
    errorRecovery = isEnabled('V3_ERROR_BOUNDARIES'),
    performanceTracking = isEnabled('PERFORMANCE_MONITORING'),
    backgroundRefresh = isEnabled('V3_PERFORMANCE_MODE'),
    visibilityOptimization = true,
    maxRetries = 3,
    fallbackToCache = true
  } = options;

  const [state, setState] = useState<EnhancedApiState>({
    loading: true,
    error: null,
    data: [],
    lastUpdate: null,
    connectionState: 'disconnected',
    errorContext: null,
    lastDataUpdate: null,
    isRealTimeActive: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const performanceTimerRef = useRef<ReturnType<typeof performance.now> | null>(null);
  const configRef = useRef(options);

  // Update config ref when options change
  useEffect(() => {
    configRef.current = options;
  }, [options]);

  // Memoized statistics calculation with enhanced metrics
  const stats = useMemo((): AlphaStackStats => {
    if (!state.data.length) {
      return { 
        count: 0, 
        avgScore: 0, 
        highConfidence: 0, 
        lastUpdate: state.lastUpdate || undefined 
      };
    }

    const avgScore = state.data.reduce((sum, item) => sum + item.score, 0) / state.data.length;
    const highConfidence = state.data.filter(item => item.score >= 75).length;

    return {
      count: state.data.length,
      avgScore: Math.round(avgScore),
      highConfidence,
      lastUpdate: state.lastUpdate || undefined,
    };
  }, [state.data, state.lastUpdate]);

  // Enhanced performance metrics
  const performanceMetrics = useMemo(() => {
    if (!performanceTracking) {
      return {
        responseTime: 0,
        successRate: 100,
        errorRate: 0,
        cacheHitRate: 0
      };
    }

    const summary = performanceMonitor.getSummary(300000); // Last 5 minutes
    return {
      responseTime: summary.metrics.apiResponseTime.avg,
      successRate: summary.metrics.successRate,
      errorRate: summary.metrics.errorRate,
      cacheHitRate: summary.metrics.cacheHitRate
    };
  }, [performanceTracking, state.lastUpdate]);

  // Health score calculation
  const healthScore = useMemo(() => {
    if (!performanceTracking) return 100;
    return performanceMonitor.getHealthScore();
  }, [performanceTracking, state.lastUpdate]);

  // System status
  const systemStatus = useMemo(() => {
    if (!errorRecovery) {
      return {
        status: 'healthy' as const,
        message: 'All systems operational'
      };
    }
    return errorHandler.getSystemStatus();
  }, [errorRecovery, state.errorContext]);

  // Check if data is stale
  const isStale = useMemo(() => {
    if (!state.lastUpdate) return true;
    return Date.now() - state.lastUpdate.getTime() > refreshInterval * 1.5;
  }, [state.lastUpdate, refreshInterval]);

  // Enhanced fetch function with full fault tolerance
  const fetchData = useCallback(async (forceRefresh = false): Promise<void> => {
    if (performanceTimerRef.current) {
      performanceTimerRef.current = performance.now();
    }

    try {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setState(prev => ({ 
        ...prev, 
        loading: true, 
        error: null,
        errorContext: null
      }));

      // Use enhanced API client
      const result = await alphaStackClient.fetchSqueezeData({
        useCache: cacheEnabled && !forceRefresh,
        timeout: 15000,
        retryOptions: {
          maxAttempts: maxRetries,
          baseDelay: 1000,
          maxDelay: 5000,
          exponentialBase: 2,
          jitter: true
        }
      });

      // Record performance if tracking enabled
      if (performanceTracking && performanceTimerRef.current) {
        const duration = performance.now() - performanceTimerRef.current;
        performanceMonitor.recordApiRequest(
          duration,
          !result.error,
          '/api/v2/scan/squeeze',
          result.source === 'cache'
        );
      }

      // Store successful data for fallback
      if (errorRecovery && result.results && result.results.length > 0) {
        errorHandler.storeFallbackData(result.results);
      }

      setState(prev => ({
        ...prev,
        loading: false,
        data: result.results || [],
        lastUpdate: new Date(),
        lastDataUpdate: new Date(),
        error: result.error ? new Error(result.error) : null,
      }));

      retryCountRef.current = 0;

      if (isEnabled('DEBUG_MODE')) {
        console.log(`✅ Enhanced AlphaStack: Loaded ${result.results?.length || 0} candidates from ${result.source}`);
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }

      retryCountRef.current++;

      // Use enhanced error handling
      if (errorRecovery) {
        const { errorContext, recovery } = await errorHandler.handleError(err as Error, {
          endpoint: '/api/v2/scan/squeeze',
          metadata: { 
            retryCount: retryCountRef.current,
            forceRefresh 
          }
        });

        setState(prev => ({
          ...prev,
          loading: false,
          error: err as Error,
          errorContext,
          // Use recovery data if available
          data: recovery?.results || prev.data,
          lastUpdate: recovery ? new Date() : prev.lastUpdate,
        }));

        if (isEnabled('DEBUG_MODE')) {
          console.warn('⚠️ Enhanced AlphaStack error handled:', errorContext);
        }
      } else {
        // Fallback to basic error handling
        setState(prev => ({
          ...prev,
          loading: false,
          error: err as Error,
        }));

        console.error('❌ Enhanced AlphaStack fetch error:', err);
      }
    }
  }, [cacheEnabled, maxRetries, errorRecovery, performanceTracking]);

  // Real-time update handler
  const handleRealTimeUpdate = useCallback((update: DataUpdate) => {
    setState(prev => ({
      ...prev,
      data: update.data,
      lastUpdate: update.timestamp,
      lastDataUpdate: update.timestamp,
    }));

    if (isEnabled('DEBUG_MODE')) {
      console.log(`🔄 Real-time update: ${update.data.length} candidates, ${update.changeCount} changes`);
    }
  }, []);

  // Connection state handler
  const handleConnectionStateChange = useCallback((connectionState: ConnectionState) => {
    setState(prev => ({
      ...prev,
      connectionState,
      isRealTimeActive: connectionState === 'connected'
    }));
  }, []);

  // Initialize real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    realTimeManager.updateConfig({
      pollingInterval: refreshInterval,
      enableBackgroundRefresh: backgroundRefresh,
      visibilityOptimization
    });

    const unsubscribeUpdate = realTimeManager.onUpdate(handleRealTimeUpdate);
    const unsubscribeState = realTimeManager.onStateChange(handleConnectionStateChange);

    realTimeManager.start().catch(error => {
      console.warn('⚠️ Real-time manager failed to start:', error);
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeState();
      realTimeManager.stop();
    };
  }, [realTimeUpdates, refreshInterval, backgroundRefresh, visibilityOptimization, handleRealTimeUpdate, handleConnectionStateChange]);

  // Auto-refresh effect (fallback when real-time is disabled)
  useEffect(() => {
    if (realTimeUpdates) return; // Real-time manager handles updates

    fetchData();

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        // Only refresh if tab is visible (performance optimization)
        if (!visibilityOptimization || !document.hidden) {
          fetchData();
        }
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval, realTimeUpdates, visibilityOptimization]);

  // Visibility change optimization
  useEffect(() => {
    if (!visibilityOptimization) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && isStale && autoRefresh) {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData, isStale, autoRefresh, visibilityOptimization]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Enhanced control functions
  const retry = useCallback(async (): Promise<void> => {
    retryCountRef.current = 0;
    await fetchData(true);
  }, [fetchData]);

  const resetConnection = useCallback(async (): Promise<void> => {
    if (realTimeUpdates) {
      await realTimeManager.stop();
      await realTimeManager.start();
    }
    
    // Reset API client
    alphaStackClient.reset();
    
    // Clear errors
    if (errorRecovery) {
      errorHandler.clearHistory();
    }
    
    setState(prev => ({
      ...prev,
      error: null,
      errorContext: null,
      connectionState: 'disconnected'
    }));
    
    await fetchData(true);
  }, [realTimeUpdates, errorRecovery, fetchData]);

  const clearErrors = useCallback((): void => {
    setState(prev => ({
      ...prev,
      error: null,
      errorContext: null
    }));
    
    if (errorRecovery) {
      errorHandler.clearHistory();
    }
  }, [errorRecovery]);

  const updateConfig = useCallback((newConfig: Partial<EnhancedUseAlphaStackDataOptions>): void => {
    configRef.current = { ...configRef.current, ...newConfig };
    
    if (realTimeUpdates && newConfig.refreshInterval) {
      realTimeManager.updateConfig({
        pollingInterval: newConfig.refreshInterval
      });
    }
  }, [realTimeUpdates]);

  return {
    // Base interface
    data: state.data,
    loading: state.loading,
    error: state.error,
    lastUpdate: state.lastUpdate,
    stats,
    refetch: fetchData,
    isStale,
    
    // Enhanced interface
    connectionState: state.connectionState,
    errorContext: state.errorContext,
    healthScore,
    performanceMetrics,
    retry,
    resetConnection,
    clearErrors,
    updateConfig,
    systemStatus
  };
};

/**
 * Hook for monitoring AlphaStack system health
 */
export const useAlphaStackHealth = () => {
  const [healthData, setHealthData] = useState({
    score: 100,
    status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
    metrics: {
      responseTime: 0,
      successRate: 100,
      errorRate: 0,
      cacheHitRate: 0
    }
  });

  useEffect(() => {
    if (!isEnabled('PERFORMANCE_MONITORING')) return;

    const updateHealth = () => {
      const score = performanceMonitor.getHealthScore();
      const summary = performanceMonitor.getSummary(300000);
      const systemStatus = errorHandler.getSystemStatus();

      setHealthData({
        score,
        status: systemStatus.status,
        metrics: {
          responseTime: summary.metrics.apiResponseTime.avg,
          successRate: summary.metrics.successRate,
          errorRate: summary.metrics.errorRate,
          cacheHitRate: summary.metrics.cacheHitRate
        }
      });
    };

    updateHealth();
    const interval = setInterval(updateHealth, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return healthData;
};

/**
 * Hook for AlphaStack performance alerts
 */
export const useAlphaStackAlerts = () => {
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    level: 'warning' | 'critical';
    message: string;
    timestamp: Date;
  }>>([]);

  useEffect(() => {
    if (!isEnabled('PERFORMANCE_MONITORING')) return;

    const unsubscribe = performanceMonitor.onAlert((alert) => {
      if (alert.resolved) {
        setAlerts(prev => prev.filter(a => a.id !== alert.id));
      } else {
        setAlerts(prev => [
          ...prev.filter(a => a.id !== alert.id),
          {
            id: alert.id,
            level: alert.level,
            message: alert.message,
            timestamp: alert.timestamp
          }
        ]);
      }
    });

    return unsubscribe;
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return { alerts, dismissAlert };
};