/**
 * Enhanced Error Handling & Recovery System
 * Comprehensive error classification, graceful degradation, and user-friendly messaging
 */

import type { AlphaStackResponse, AlphaStackCandidate } from '../types/alphastack';
import { isEnabled } from '../config/feature-flags';

export enum ErrorType {
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  API_ERROR = 'API_ERROR',
  VALIDATION = 'VALIDATION',
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface ErrorContext {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  originalError?: Error;
  endpoint?: string;
  retryable: boolean;
  timestamp: Date;
  requestId?: string;
  metadata?: Record<string, any>;
}

export interface RecoveryStrategy {
  name: string;
  canRecover: (error: ErrorContext) => boolean;
  recover: (error: ErrorContext) => Promise<AlphaStackResponse | null>;
  priority: number; // Lower numbers = higher priority
}

export interface FallbackData {
  data: AlphaStackCandidate[];
  source: 'cache' | 'mock' | 'previous';
  timestamp: Date;
  reliability: number; // 0-1 scale
}

class ErrorClassifier {
  private patterns = new Map<RegExp, ErrorType>([
    [/fetch|network|connection/i, ErrorType.NETWORK],
    [/timeout|aborted/i, ErrorType.TIMEOUT],
    [/HTTP [45]\d{2}/i, ErrorType.API_ERROR],
    [/circuit breaker/i, ErrorType.CIRCUIT_BREAKER],
    [/invalid|malformed|validation/i, ErrorType.VALIDATION]
  ]);

  classify(error: Error): ErrorType {
    const message = error.message || error.toString();
    
    for (const [pattern, type] of this.patterns) {
      if (pattern.test(message)) {
        return type;
      }
    }
    
    return ErrorType.UNKNOWN;
  }

  getSeverity(type: ErrorType, statusCode?: number): ErrorSeverity {
    switch (type) {
      case ErrorType.NETWORK:
        return ErrorSeverity.HIGH;
      case ErrorType.TIMEOUT:
        return ErrorSeverity.MEDIUM;
      case ErrorType.API_ERROR:
        if (statusCode && statusCode >= 500) return ErrorSeverity.HIGH;
        if (statusCode && statusCode >= 400) return ErrorSeverity.MEDIUM;
        return ErrorSeverity.LOW;
      case ErrorType.CIRCUIT_BREAKER:
        return ErrorSeverity.CRITICAL;
      case ErrorType.VALIDATION:
        return ErrorSeverity.LOW;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  getRetryability(type: ErrorType, statusCode?: number): boolean {
    switch (type) {
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
        return true;
      case ErrorType.API_ERROR:
        // Retry 5xx errors, not 4xx
        return statusCode ? statusCode >= 500 : false;
      case ErrorType.CIRCUIT_BREAKER:
        return false; // Circuit breaker handles its own retry logic
      case ErrorType.VALIDATION:
        return false; // Data issues won't fix themselves
      default:
        return true; // Conservative approach
    }
  }
}

class FallbackDataManager {
  private localStorage: Storage | null = null;
  private mockData: AlphaStackCandidate[] = [];

  constructor() {
    // Safely access localStorage
    try {
      this.localStorage = typeof window !== 'undefined' ? window.localStorage : null;
    } catch (e) {
      // localStorage might be disabled
      this.localStorage = null;
    }

    this.initializeMockData();
  }

  private initializeMockData(): void {
    // High-quality mock data for emergency fallback
    this.mockData = [
      {
        ticker: 'FALLBACK1',
        price: 0,
        changePct: 0,
        rvol: 1.0,
        vwapRel: 1.0,
        floatM: 0,
        shortPct: 0,
        borrowFeePct: 0,
        utilizationPct: 0,
        options: { cpr: 0, ivPctile: 0, atmOiTrend: 'neutral' },
        technicals: { emaCross: false, atrPct: 0, rsi: 50 },
        catalyst: { type: 'System Maintenance', when: new Date().toISOString().split('T')[0] },
        sentiment: { redditRank: 5, stocktwitsRank: 5, youtubeTrend: 'neutral' },
        score: 0,
        plan: { entry: 'Service temporarily unavailable', stopPct: 0, tp1Pct: 0, tp2Pct: 0 }
      }
    ];
  }

  storeFallbackData(data: AlphaStackCandidate[]): void {
    if (!this.localStorage || !data.length) return;

    try {
      const fallbackData: FallbackData = {
        data,
        source: 'cache',
        timestamp: new Date(),
        reliability: 0.9
      };
      
      this.localStorage.setItem('alphastack_fallback', JSON.stringify(fallbackData));
    } catch (e) {
      console.warn('Failed to store fallback data:', e);
    }
  }

  getFallbackData(): FallbackData | null {
    if (!this.localStorage) {
      return {
        data: this.mockData,
        source: 'mock',
        timestamp: new Date(),
        reliability: 0.1
      };
    }

    try {
      const stored = this.localStorage.getItem('alphastack_fallback');
      if (!stored) return null;

      const parsed: FallbackData = JSON.parse(stored);
      
      // Check if data is too old (older than 1 hour)
      const age = Date.now() - new Date(parsed.timestamp).getTime();
      if (age > 3600000) {
        return null;
      }

      return parsed;
    } catch (e) {
      console.warn('Failed to retrieve fallback data:', e);
      return null;
    }
  }

  clearFallbackData(): void {
    if (this.localStorage) {
      try {
        this.localStorage.removeItem('alphastack_fallback');
      } catch (e) {
        console.warn('Failed to clear fallback data:', e);
      }
    }
  }
}

export class ErrorHandler {
  private classifier = new ErrorClassifier();
  private fallbackManager = new FallbackDataManager();
  private recoveryStrategies: RecoveryStrategy[] = [];
  private errorHistory: ErrorContext[] = [];
  private maxHistorySize = 50;

  constructor() {
    this.initializeRecoveryStrategies();
  }

  private initializeRecoveryStrategies(): void {
    // Strategy 1: Cached data recovery
    this.recoveryStrategies.push({
      name: 'cached_data_recovery',
      priority: 1,
      canRecover: (error) => error.type !== ErrorType.VALIDATION,
      recover: async (error) => {
        const fallback = this.fallbackManager.getFallbackData();
        if (!fallback) return null;

        return {
          asof: fallback.timestamp.toISOString(),
          results: fallback.data,
          source: 'fallback-cache',
          error: `Using cached data due to: ${error.message}`
        };
      }
    });

    // Strategy 2: Gradual degradation (reduce data complexity)
    this.recoveryStrategies.push({
      name: 'degraded_service',
      priority: 2,
      canRecover: (error) => error.type === ErrorType.TIMEOUT || error.type === ErrorType.API_ERROR,
      recover: async (error) => {
        // Simplified data structure for reduced load
        return {
          asof: new Date().toISOString(),
          results: [],
          source: 'degraded',
          error: `Service degraded: ${error.userMessage}`
        };
      }
    });

    // Strategy 3: Emergency mock data
    this.recoveryStrategies.push({
      name: 'emergency_mock',
      priority: 3,
      canRecover: () => true, // Always available as last resort
      recover: async (error) => {
        const fallback = this.fallbackManager.getFallbackData();
        
        return {
          asof: new Date().toISOString(),
          results: fallback?.data || [],
          source: 'emergency',
          error: `Emergency mode: ${error.userMessage}`
        };
      }
    });
  }

  /**
   * Main error handling entry point
   */
  async handleError(
    error: Error,
    context?: {
      endpoint?: string;
      requestId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<{
    errorContext: ErrorContext;
    recovery: AlphaStackResponse | null;
    shouldRetry: boolean;
  }> {
    const errorContext = this.createErrorContext(error, context);
    this.recordError(errorContext);

    if (isEnabled('DEBUG_MODE')) {
      console.warn('🔥 Error Handler:', errorContext);
    }

    // Attempt recovery using strategies
    const recovery = await this.attemptRecovery(errorContext);

    return {
      errorContext,
      recovery,
      shouldRetry: errorContext.retryable && this.shouldAllowRetry(errorContext)
    };
  }

  private createErrorContext(
    error: Error,
    context?: {
      endpoint?: string;
      requestId?: string;
      metadata?: Record<string, any>;
    }
  ): ErrorContext {
    const type = this.classifier.classify(error);
    const statusCode = this.extractStatusCode(error);
    const severity = this.classifier.getSeverity(type, statusCode);
    const retryable = this.classifier.getRetryability(type, statusCode);

    return {
      type,
      severity,
      message: error.message || 'Unknown error',
      userMessage: this.createUserMessage(type, severity),
      originalError: error,
      endpoint: context?.endpoint,
      retryable,
      timestamp: new Date(),
      requestId: context?.requestId,
      metadata: context?.metadata
    };
  }

  private extractStatusCode(error: Error): number | undefined {
    const match = error.message.match(/HTTP (\d{3})/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  private createUserMessage(type: ErrorType, severity: ErrorSeverity): string {
    const baseMessages = {
      [ErrorType.NETWORK]: 'Network connection issue',
      [ErrorType.TIMEOUT]: 'Request timed out',
      [ErrorType.API_ERROR]: 'Service temporarily unavailable',
      [ErrorType.VALIDATION]: 'Data validation error',
      [ErrorType.CIRCUIT_BREAKER]: 'Service protection activated',
      [ErrorType.UNKNOWN]: 'Temporary service issue'
    };

    const severityModifiers = {
      [ErrorSeverity.LOW]: 'Minor issue - ',
      [ErrorSeverity.MEDIUM]: 'Temporary issue - ',
      [ErrorSeverity.HIGH]: 'Service disruption - ',
      [ErrorSeverity.CRITICAL]: 'Critical issue - '
    };

    const base = baseMessages[type] || 'Unknown issue';
    const modifier = severity === ErrorSeverity.LOW ? '' : severityModifiers[severity];
    
    return `${modifier}${base}. Please try again or contact support if this persists.`;
  }

  private async attemptRecovery(errorContext: ErrorContext): Promise<AlphaStackResponse | null> {
    // Sort strategies by priority
    const sortedStrategies = [...this.recoveryStrategies].sort((a, b) => a.priority - b.priority);

    for (const strategy of sortedStrategies) {
      if (strategy.canRecover(errorContext)) {
        try {
          const result = await strategy.recover(errorContext);
          if (result) {
            if (isEnabled('DEBUG_MODE')) {
              console.log(`✅ Recovery successful using strategy: ${strategy.name}`);
            }
            return result;
          }
        } catch (recoveryError) {
          console.warn(`❌ Recovery strategy ${strategy.name} failed:`, recoveryError);
        }
      }
    }

    return null;
  }

  private shouldAllowRetry(errorContext: ErrorContext): boolean {
    // Don't retry if we've seen too many similar errors recently
    const recentSimilarErrors = this.errorHistory
      .filter(e => e.type === errorContext.type)
      .filter(e => Date.now() - e.timestamp.getTime() < 60000) // Last minute
      .length;

    return recentSimilarErrors < 3;
  }

  private recordError(errorContext: ErrorContext): void {
    this.errorHistory.push(errorContext);
    
    // Maintain history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Store successful data for future fallback use
   */
  storeFallbackData(data: AlphaStackCandidate[]): void {
    this.fallbackManager.storeFallbackData(data);
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    recentErrors: number;
  } {
    const recent = this.errorHistory.filter(e => Date.now() - e.timestamp.getTime() < 300000); // Last 5 minutes
    
    const errorsByType = Object.values(ErrorType).reduce((acc, type) => {
      acc[type] = this.errorHistory.filter(e => e.type === type).length;
      return acc;
    }, {} as Record<ErrorType, number>);

    const errorsBySeverity = Object.values(ErrorSeverity).reduce((acc, severity) => {
      acc[severity] = this.errorHistory.filter(e => e.severity === severity).length;
      return acc;
    }, {} as Record<ErrorSeverity, number>);

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      errorsBySeverity,
      recentErrors: recent.length
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
    this.fallbackManager.clearFallbackData();
  }

  /**
   * Get user-friendly status message based on recent errors
   */
  getSystemStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    lastError?: Date;
  } {
    const recentErrors = this.errorHistory.filter(e => Date.now() - e.timestamp.getTime() < 300000);
    const criticalErrors = recentErrors.filter(e => e.severity === ErrorSeverity.CRITICAL);
    
    if (criticalErrors.length > 0) {
      return {
        status: 'unhealthy',
        message: 'Service experiencing critical issues',
        lastError: criticalErrors[criticalErrors.length - 1].timestamp
      };
    }

    if (recentErrors.length > 5) {
      return {
        status: 'degraded',
        message: 'Service experiencing intermittent issues',
        lastError: recentErrors[recentErrors.length - 1].timestamp
      };
    }

    return {
      status: 'healthy',
      message: 'All systems operational'
    };
  }
}

// Singleton instance for global use
export const errorHandler = new ErrorHandler();