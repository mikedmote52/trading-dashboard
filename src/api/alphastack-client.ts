/**
 * Enhanced AlphaStack API Client
 * Fault-tolerant data fetching with circuit breaker pattern and intelligent caching
 */

import type { AlphaStackResponse, AlphaStackCandidate } from '../types/alphastack';
import { isEnabled } from '../config/feature-flags';

// Circuit breaker states
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  retryAttempts: number;
  resetTimeout: number;
}

interface RequestMetrics {
  attempts: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgResponseTime: number;
}

interface CacheEntry {
  data: AlphaStackResponse;
  timestamp: number;
  ttl: number;
  staleWhileRevalidate: boolean;
}

interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - rejecting requests');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): { failures: number; state: CircuitState; lastFailureTime: number } {
    return {
      failures: this.failures,
      state: this.state,
      lastFailureTime: this.lastFailureTime
    };
  }
}

class RequestCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 100;

  set(key: string, data: AlphaStackResponse, ttl: number = 30000, staleWhileRevalidate = true): void {
    // Cleanup old entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      staleWhileRevalidate
    });
  }

  get(key: string): { data: AlphaStackResponse; isStale: boolean } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    const isExpired = age > entry.ttl;

    if (isExpired && !entry.staleWhileRevalidate) {
      this.cache.delete(key);
      return null;
    }

    return {
      data: entry.data,
      isStale: isExpired
    };
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

class RequestDeduplicator {
  private activeRequests = new Map<string, Promise<AlphaStackResponse>>();

  async dedupe(key: string, requestFn: () => Promise<AlphaStackResponse>): Promise<AlphaStackResponse> {
    if (this.activeRequests.has(key)) {
      return this.activeRequests.get(key)!;
    }

    const promise = requestFn().finally(() => {
      this.activeRequests.delete(key);
    });

    this.activeRequests.set(key, promise);
    return promise;
  }

  clear(): void {
    this.activeRequests.clear();
  }
}

export class AlphaStackClient {
  private circuitBreaker: CircuitBreaker;
  private cache: RequestCache;
  private deduplicator: RequestDeduplicator;
  private metrics: RequestMetrics;
  private baseUrl: string;

  private readonly defaultRetryOptions: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialBase: 2,
    jitter: true
  };

  private readonly circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    timeout: 30000,
    retryAttempts: 3,
    resetTimeout: 60000
  };

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.circuitBreaker = new CircuitBreaker(this.circuitBreakerConfig);
    this.cache = new RequestCache();
    this.deduplicator = new RequestDeduplicator();
    this.metrics = {
      attempts: 0,
      failures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Fetch squeeze candidates with full fault tolerance
   */
  async fetchSqueezeData(options?: {
    useCache?: boolean;
    bypassCircuitBreaker?: boolean;
    timeout?: number;
    retryOptions?: Partial<RetryOptions>;
  }): Promise<AlphaStackResponse> {
    const {
      useCache = isEnabled('V3_API_CACHING'),
      bypassCircuitBreaker = false,
      timeout = 15000,
      retryOptions = {}
    } = options || {};

    const cacheKey = 'squeeze-data';
    const finalRetryOptions = { ...this.defaultRetryOptions, ...retryOptions };

    // Check cache first (even if stale for fallback)
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        if (!cached.isStale) {
          // Fresh cache hit
          return {
            ...cached.data,
            source: 'cache'
          };
        }
        // Store stale data for potential fallback
        var staleData = cached.data;
      }
    }

    // Deduplicate concurrent requests
    return this.deduplicator.dedupe(cacheKey, async () => {
      try {
        const result = bypassCircuitBreaker 
          ? await this.performRequest(timeout, finalRetryOptions)
          : await this.circuitBreaker.execute(() => this.performRequest(timeout, finalRetryOptions));

        // Cache successful response
        if (useCache && result.results) {
          this.cache.set(cacheKey, result, 30000, true);
        }

        this.updateMetricsOnSuccess();
        return result;

      } catch (error) {
        this.updateMetricsOnFailure();
        
        // Fallback to stale cache if available
        if (staleData) {
          console.warn('⚠️ API failed, serving stale data:', error);
          return {
            ...staleData,
            source: 'stale-cache',
            error: `API Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

        // Final fallback to empty results
        console.error('❌ API failed with no cache fallback:', error);
        return {
          asof: new Date().toISOString(),
          results: [],
          source: 'error',
          error: error instanceof Error ? error.message : 'Request failed'
        };
      }
    });
  }

  private async performRequest(timeout: number, retryOptions: RetryOptions): Promise<AlphaStackResponse> {
    const startTime = performance.now();
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt++) {
      try {
        this.metrics.attempts++;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${this.baseUrl}/api/v2/scan/squeeze`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'X-Request-ID': `alphastack-${Date.now()}-${attempt}`,
            'X-Client-Version': '3.0-enhanced',
            'Accept': 'application/json'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: AlphaStackResponse = await response.json();
        
        // Validate response structure
        this.validateResponse(data);

        const responseTime = performance.now() - startTime;
        this.updateResponseTime(responseTime);

        if (isEnabled('API_LOGGING')) {
          console.log(`✅ AlphaStack API: ${data.results?.length || 0} candidates in ${responseTime.toFixed(1)}ms (attempt ${attempt})`);
        }

        return data;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown request error');
        
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(`Request timeout after ${timeout}ms`);
        }

        if (isEnabled('API_LOGGING')) {
          console.warn(`⚠️ AlphaStack API attempt ${attempt}/${retryOptions.maxAttempts} failed:`, lastError.message);
        }

        // Don't retry on final attempt
        if (attempt === retryOptions.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateRetryDelay(attempt, retryOptions);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private calculateRetryDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = options.baseDelay * Math.pow(options.exponentialBase, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, options.maxDelay);
    
    if (options.jitter) {
      // Add 25% jitter to prevent thundering herd
      const jitterRange = cappedDelay * 0.25;
      const jitter = (Math.random() * jitterRange * 2) - jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private validateResponse(data: AlphaStackResponse): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response: not an object');
    }

    if (!Array.isArray(data.results)) {
      throw new Error('Invalid response: results must be an array');
    }

    if (!data.asof || typeof data.asof !== 'string') {
      throw new Error('Invalid response: missing or invalid asof timestamp');
    }

    // Validate candidate structure for non-empty results
    if (data.results.length > 0) {
      const firstCandidate = data.results[0];
      if (!firstCandidate.ticker || typeof firstCandidate.score !== 'number') {
        throw new Error('Invalid response: malformed candidate data');
      }
    }
  }

  private updateMetricsOnSuccess(): void {
    this.metrics.lastSuccess = Date.now();
  }

  private updateMetricsOnFailure(): void {
    this.metrics.failures++;
    this.metrics.lastFailure = Date.now();
  }

  private updateResponseTime(responseTime: number): void {
    // Simple moving average
    if (this.metrics.avgResponseTime === 0) {
      this.metrics.avgResponseTime = responseTime;
    } else {
      this.metrics.avgResponseTime = (this.metrics.avgResponseTime * 0.8) + (responseTime * 0.2);
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ healthy: boolean; responseTime: number }> {
    const startTime = performance.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/api/healthz`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      const responseTime = performance.now() - startTime;
      return {
        healthy: response.ok,
        responseTime
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: performance.now() - startTime
      };
    }
  }

  /**
   * Get current metrics and circuit breaker status
   */
  getMetrics(): {
    requests: RequestMetrics;
    circuitBreaker: ReturnType<CircuitBreaker['getMetrics']>;
    cache: { size: number };
  } {
    return {
      requests: { ...this.metrics },
      circuitBreaker: this.circuitBreaker.getMetrics(),
      cache: { size: this.cache.size() }
    };
  }

  /**
   * Clear all caches and reset metrics
   */
  reset(): void {
    this.cache.clear();
    this.deduplicator.clear();
    this.metrics = {
      attempts: 0,
      failures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Force circuit breaker to close (for emergency override)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = new CircuitBreaker(this.circuitBreakerConfig);
  }
}

// Singleton instance for global use
export const alphaStackClient = new AlphaStackClient();

// Export for dependency injection in tests
export { CircuitBreaker, RequestCache, RequestDeduplicator };