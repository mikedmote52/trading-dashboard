/**
 * AlphaStack V3 Custom Hooks
 * High-performance data fetching and state management
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type {
  AlphaStackCandidate,
  AlphaStackResponse,
  AlphaStackStats,
  UseAlphaStackDataReturn,
  ApiState,
  PerformanceMetrics,
  AnalyticsEvent
} from '../types/alphastack';

// Performance monitoring utilities
const createPerformanceTimer = () => {
  const start = performance.now();
  return {
    mark: (label: string) => performance.now() - start,
    end: () => performance.now() - start
  };
};

// Request deduplication utility
class RequestDeduplicator {
  private activeRequests = new Map<string, Promise<any>>();

  async dedupe<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    if (this.activeRequests.has(key)) {
      return this.activeRequests.get(key) as Promise<T>;
    }

    const promise = requestFn().finally(() => {
      this.activeRequests.delete(key);
    });

    this.activeRequests.set(key, promise);
    return promise;
  }

  clear() {
    this.activeRequests.clear();
  }
}

// Global request deduplicator instance
const requestDeduplicator = new RequestDeduplicator();

// Cache implementation for API responses
class ApiCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private maxSize = 50;

  set(key: string, data: any, ttl: number = 30000) {
    // Clean old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear() {
    this.cache.clear();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}

// Global cache instance
const apiCache = new ApiCache();

// Analytics tracking (optional)
const trackEvent = (event: AnalyticsEvent) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 AlphaStack Analytics:', event);
  }
  // Could integrate with analytics service here
};

/**
 * High-performance hook for AlphaStack data fetching
 * Features:
 * - Request deduplication
 * - Intelligent caching
 * - Error boundaries
 * - Performance monitoring
 * - Graceful degradation
 */
export const useAlphaStackData = (
  autoRefresh: boolean = true,
  refreshInterval: number = 30000,
  cacheEnabled: boolean = true
): UseAlphaStackDataReturn => {
  const [state, setState] = useState<ApiState>({
    loading: true,
    error: null,
    data: [],
    lastUpdate: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const performanceMetricsRef = useRef<PerformanceMetrics>({
    loadTime: 0,
    renderTime: 0,
    updateTime: 0,
    apiResponseTime: 0,
    errorCount: 0,
  });

  // Memoized statistics calculation
  const stats = useMemo((): AlphaStackStats => {
    if (!state.data.length) {
      return { count: 0, avgScore: 0, highConfidence: 0, lastUpdate: state.lastUpdate || undefined };
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

  // Check if data is stale
  const isStale = useMemo(() => {
    if (!state.lastUpdate) return true;
    return Date.now() - state.lastUpdate.getTime() > refreshInterval * 1.5;
  }, [state.lastUpdate, refreshInterval]);

  // Optimized fetch function with caching and deduplication
  const fetchData = useCallback(async (): Promise<void> => {
    const timer = createPerformanceTimer();
    const requestId = `alphastack-${Date.now()}`;
    
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
        requestId 
      }));

      // Check cache first
      const cacheKey = 'alphastack-squeeze';
      if (cacheEnabled && apiCache.has(cacheKey)) {
        const cachedData = apiCache.get(cacheKey);
        setState(prev => ({
          ...prev,
          loading: false,
          data: cachedData.results || [],
          lastUpdate: new Date(cachedData.asof),
        }));

        trackEvent({
          type: 'data_fetch',
          timestamp: new Date(),
          data: { source: 'cache', count: cachedData.results?.length || 0 }
        });

        return;
      }

      // Deduplicated API request
      const result = await requestDeduplicator.dedupe(cacheKey, async () => {
        const response = await fetch('/api/v2/scan/squeeze', {
          signal: abortControllerRef.current?.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'X-Request-ID': requestId,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      });

      const apiResponseTime = timer.mark('api_response');
      performanceMetricsRef.current.apiResponseTime = apiResponseTime;

      const apiResult: AlphaStackResponse = result;

      if (apiResult.error) {
        throw new Error(apiResult.error);
      }

      // Cache successful response
      if (cacheEnabled && apiResult.results) {
        apiCache.set(cacheKey, apiResult, refreshInterval);
      }

      setState(prev => ({
        ...prev,
        loading: false,
        data: apiResult.results || [],
        lastUpdate: new Date(),
        requestId,
      }));

      const totalTime = timer.end();
      performanceMetricsRef.current.loadTime = totalTime;

      console.log(`✅ AlphaStackV3: Loaded ${apiResult.results?.length || 0} candidates from ${apiResult.source} in ${totalTime.toFixed(1)}ms`);

      trackEvent({
        type: 'data_fetch',
        timestamp: new Date(),
        data: { 
          source: apiResult.source, 
          count: apiResult.results?.length || 0,
          requestId 
        },
        performance: {
          loadTime: totalTime,
          apiResponseTime
        }
      });

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }

      const error = err instanceof Error ? err : new Error('Unknown fetch error');
      
      setState(prev => ({
        ...prev,
        loading: false,
        error,
      }));

      performanceMetricsRef.current.errorCount++;

      console.error('❌ AlphaStackV3 fetch error:', error);

      trackEvent({
        type: 'error',
        timestamp: new Date(),
        data: { 
          error: error.message,
          requestId 
        }
      });

    }
  }, [cacheEnabled, refreshInterval]);

  // Auto-refresh effect with intelligent scheduling
  useEffect(() => {
    fetchData();

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        // Only refresh if tab is visible (performance optimization)
        if (!document.hidden) {
          fetchData();
        }
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval]);

  // Visibility change optimization - refresh when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isStale && autoRefresh) {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData, isStale, autoRefresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    lastUpdate: state.lastUpdate,
    stats,
    refetch: fetchData,
    isStale,
  };
};

/**
 * Hook for performance monitoring
 */
export const usePerformanceMetrics = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadTime: 0,
    renderTime: 0,
    updateTime: 0,
    apiResponseTime: 0,
    errorCount: 0,
  });

  const startRenderTimer = useCallback(() => {
    const start = performance.now();
    return () => {
      const renderTime = performance.now() - start;
      setMetrics(prev => ({ ...prev, renderTime }));
    };
  }, []);

  const incrementErrorCount = useCallback(() => {
    setMetrics(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
  }, []);

  return {
    metrics,
    startRenderTimer,
    incrementErrorCount,
  };
};

/**
 * Hook for candidate filtering and sorting
 */
export const useFilteredCandidates = (
  candidates: AlphaStackCandidate[],
  filters?: {
    minScore?: number;
    maxScore?: number;
    search?: string;
  }
) => {
  return useMemo(() => {
    if (!filters) return candidates;

    return candidates.filter(candidate => {
      if (filters.minScore && candidate.score < filters.minScore) return false;
      if (filters.maxScore && candidate.score > filters.maxScore) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return candidate.ticker.toLowerCase().includes(searchLower) ||
               candidate.plan.entry?.toLowerCase().includes(searchLower);
      }
      return true;
    });
  }, [candidates, filters]);
};

/**
 * Hook for managing component visibility (intersection observer)
 */
export const useIntersectionObserver = (threshold: number = 0.1) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
};

/**
 * Cleanup function for global resources
 */
export const cleanupAlphaStackResources = () => {
  requestDeduplicator.clear();
  apiCache.clear();
};