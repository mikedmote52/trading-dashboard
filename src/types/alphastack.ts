/**
 * AlphaStack V3 Type Definitions
 * High-performance typing for trading dashboard
 */

// Core data structures matching API response format
export interface AlphaStackCandidate {
  ticker: string;
  price: number;
  changePct: number;
  rvol: number;
  vwapRel: number;
  floatM: number;
  shortPct: number;
  borrowFeePct: number;
  utilizationPct: number;
  options: {
    cpr: number;
    ivPctile: number;
    atmOiTrend: 'bullish' | 'bearish' | 'neutral';
  };
  technicals: {
    emaCross: boolean;
    atrPct: number;
    rsi: number;
  };
  catalyst: {
    type: string;
    when: string;
  };
  sentiment: {
    redditRank: number;
    stocktwitsRank: number;
    youtubeTrend: 'bullish' | 'bearish' | 'neutral';
  };
  score: number;
  plan: {
    entry: string;
    stopPct: number;
    tp1Pct: number;
    tp2Pct: number;
  };
}

export interface AlphaStackResponse {
  asof: string;
  results: AlphaStackCandidate[];
  source: 'cache' | 'fallback' | 'error';
  error?: string;
  debug?: boolean;
}

export interface AlphaStackStats {
  count: number;
  avgScore: number;
  highConfidence: number;
  lastUpdate?: Date;
}

// Component props
export interface AlphaStackV3Props {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  maxDisplayItems?: number;
  onCandidateSelect?: (candidate: AlphaStackCandidate) => void;
  onError?: (error: Error) => void;
  onDataLoad?: (data: AlphaStackCandidate[], stats: AlphaStackStats) => void;
}

export interface CandidateCardProps {
  candidate: AlphaStackCandidate;
  onSelect?: (candidate: AlphaStackCandidate) => void;
  compact?: boolean;
}

// Feature flag types
export interface FeatureConfig {
  version: 'v2' | 'v3';
  features: string[];
  protection: {
    alphastack_immutable: boolean;
    read_only_mode: boolean;
    circuit_breaker: boolean;
  };
  performance: {
    real_time_updates: boolean;
    api_caching: boolean;
    performance_mode: boolean;
  };
}

// API state management
export interface ApiState {
  loading: boolean;
  error: Error | null;
  data: AlphaStackCandidate[];
  lastUpdate: Date | null;
  requestId?: string;
}

// Performance monitoring
export interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  updateTime: number;
  apiResponseTime: number;
  errorCount: number;
}

// Action types for reducer pattern (if needed)
export type AlphaStackAction =
  | { type: 'FETCH_START'; requestId: string }
  | { type: 'FETCH_SUCCESS'; data: AlphaStackCandidate[]; requestId: string }
  | { type: 'FETCH_ERROR'; error: Error; requestId: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_AUTO_REFRESH'; enabled: boolean }
  | { type: 'UPDATE_REFRESH_INTERVAL'; interval: number };

// Utility types
export type ScoreBucket = 'trade-ready' | 'watch' | 'monitor';
export type SentimentTrend = 'bullish' | 'bearish' | 'neutral';
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// Integration types for existing system
export interface LegacyIntegration {
  executeBuy100?: (ticker: string, price: number) => void;
  addToWatchlist?: (ticker: string) => void;
  showNotification?: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Color scheme types for theming
export interface ColorScheme {
  scoreColors: {
    high: string;
    medium: string;
    low: string;
    critical: string;
  };
  bucketColors: {
    tradeReady: { border: string; text: string };
    watch: { border: string; text: string };
    monitor: { border: string; text: string };
  };
  statusColors: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
}

// Filtering and sorting
export interface FilterOptions {
  minScore: number;
  maxScore: number;
  buckets: ScoreBucket[];
  sectors?: string[];
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
}

export interface SortOptions {
  field: keyof AlphaStackCandidate | 'score';
  direction: 'asc' | 'desc';
}

// Error types
export class AlphaStackError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AlphaStackError';
  }
}

export class ApiError extends AlphaStackError {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string
  ) {
    super(message, 'API_ERROR', { statusCode, endpoint });
    this.name = 'ApiError';
  }
}

export class FeatureFlagError extends AlphaStackError {
  constructor(message: string, public flagName: string) {
    super(message, 'FEATURE_FLAG_ERROR', { flagName });
    this.name = 'FeatureFlagError';
  }
}

// Hook return types
export interface UseAlphaStackDataReturn {
  data: AlphaStackCandidate[];
  loading: boolean;
  error: Error | null;
  lastUpdate: Date | null;
  stats: AlphaStackStats;
  refetch: () => Promise<void>;
  isStale: boolean;
}

// Performance optimization types
export interface VirtualizationConfig {
  itemHeight: number;
  overscan: number;
  enabled: boolean;
}

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached responses
  enabled: boolean;
}

// Event types for analytics
export interface AnalyticsEvent {
  type: 'component_load' | 'data_fetch' | 'user_interaction' | 'error';
  timestamp: Date;
  data: Record<string, any>;
  performance?: Partial<PerformanceMetrics>;
}

export default AlphaStackCandidate;