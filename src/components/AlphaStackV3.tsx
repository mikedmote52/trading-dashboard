import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { isEnabled, shouldUseV3 } from '../config/feature-flags';

// Type definitions for AlphaStack data structures
interface AlphaStackCandidate {
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
    atmOiTrend: string;
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
    youtubeTrend: string;
  };
  score: number;
  plan: {
    entry: string;
    stopPct: number;
    tp1Pct: number;
    tp2Pct: number;
  };
}

interface AlphaStackResponse {
  asof: string;
  results: AlphaStackCandidate[];
  source: string;
  error?: string;
}

interface AlphaStackV3Props {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onCandidateSelect?: (candidate: AlphaStackCandidate) => void;
  onError?: (error: Error) => void;
}

// Performance optimized card component with React.memo
const CandidateCard = React.memo<{
  candidate: AlphaStackCandidate;
  onSelect?: (candidate: AlphaStackCandidate) => void;
}>(({ candidate, onSelect }) => {
  const scoreColor = useMemo(() => {
    if (candidate.score >= 80) return 'text-green-400';
    if (candidate.score >= 60) return 'text-yellow-400';
    if (candidate.score >= 40) return 'text-orange-400';
    return 'text-red-400';
  }, [candidate.score]);

  const bucketInfo = useMemo(() => {
    if (candidate.score >= 75) {
      return { 
        bucket: 'TRADE-READY',
        borderColor: 'border-green-400',
        textColor: 'text-green-300'
      };
    }
    if (candidate.score >= 60) {
      return {
        bucket: 'WATCH',
        borderColor: 'border-yellow-400', 
        textColor: 'text-yellow-300'
      };
    }
    return {
      bucket: 'MONITOR',
      borderColor: 'border-blue-400',
      textColor: 'text-blue-300'
    };
  }, [candidate.score]);

  const handleCardClick = useCallback(() => {
    onSelect?.(candidate);
  }, [candidate, onSelect]);

  const handleBuyClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Integration with existing buy functionality
    if (typeof (window as any).executeBuy100 === 'function') {
      (window as any).executeBuy100(candidate.ticker, candidate.price);
    }
  }, [candidate.ticker, candidate.price]);

  const handleAddToWatchlist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Integration with existing watchlist functionality
    if (typeof (window as any).addToWatchlist === 'function') {
      (window as any).addToWatchlist(candidate.ticker);
    }
  }, [candidate.ticker]);

  return (
    <div 
      className={`
        relative bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 
        border-l-4 ${bucketInfo.borderColor} 
        hover:bg-slate-800/80 hover:scale-[1.02] 
        transition-all duration-200 cursor-pointer
        shadow-lg hover:shadow-xl
      `}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold text-lg text-white">{candidate.ticker}</h3>
          <div className="text-sm text-slate-300">${candidate.price.toFixed(2)}</div>
          <div className={`text-xs font-medium ${
            candidate.changePct >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {candidate.changePct >= 0 ? '+' : ''}{candidate.changePct.toFixed(1)}%
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${scoreColor}`}>{candidate.score}</div>
          <div className={`text-xs ${bucketInfo.textColor} font-medium`}>
            {bucketInfo.bucket}
          </div>
        </div>
      </div>

      {/* Dense Metrics Grid - Financial Professional Layout */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div className="bg-slate-900/40 rounded px-2 py-1">
          <div className="text-slate-400">RVol</div>
          <div className="font-semibold text-white">{candidate.rvol.toFixed(1)}x</div>
        </div>
        <div className="bg-slate-900/40 rounded px-2 py-1">
          <div className="text-slate-400">RSI</div>
          <div className="font-semibold text-white">{candidate.technicals.rsi}</div>
        </div>
        <div className="bg-slate-900/40 rounded px-2 py-1">
          <div className="text-slate-400">Short%</div>
          <div className="font-semibold text-white">{candidate.shortPct.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900/40 rounded px-2 py-1">
          <div className="text-slate-400">Borrow</div>
          <div className="font-semibold text-white">{candidate.borrowFeePct.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900/40 rounded px-2 py-1">
          <div className="text-slate-400">Float</div>
          <div className="font-semibold text-white">{candidate.floatM.toFixed(0)}M</div>
        </div>
        <div className="bg-slate-900/40 rounded px-2 py-1">
          <div className="text-slate-400">Util</div>
          <div className="font-semibold text-white">{candidate.utilizationPct.toFixed(0)}%</div>
        </div>
      </div>

      {/* Entry Thesis - Compact Display */}
      {candidate.plan.entry && (
        <div className="bg-blue-900/30 rounded-lg p-3 mb-3 border border-blue-700/50">
          <div className="flex items-start space-x-2">
            <span className="text-blue-300 text-sm mt-0.5">💡</span>
            <div className="flex-1">
              <div className="text-xs font-medium text-blue-200 mb-1">Entry Thesis</div>
              <div className="text-xs text-blue-100 leading-relaxed line-clamp-2">
                {candidate.plan.entry}
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className="text-green-300">
                  🎯 TP1: +{candidate.plan.tp1Pct}%
                </span>
                <span className="text-red-300">
                  🛑 Stop: -{candidate.plan.stopPct}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Catalyst & Sentiment */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="bg-purple-900/30 rounded px-2 py-1">
          <div className="text-purple-300 font-medium">{candidate.catalyst.type}</div>
          <div className="text-purple-200">{candidate.catalyst.when}</div>
        </div>
        <div className="bg-orange-900/30 rounded px-2 py-1">
          <div className="text-orange-300 font-medium">Sentiment</div>
          <div className="text-orange-200">
            R:{candidate.sentiment.redditRank} ST:{candidate.sentiment.stocktwitsRank}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-2">
        <button
          onClick={handleBuyClick}
          className="
            flex-1 bg-gradient-to-r from-green-500 to-green-600 
            hover:from-green-600 hover:to-green-700 
            text-white font-semibold py-2 px-3 rounded-lg 
            transition-all transform hover:scale-105 shadow-lg
            text-sm
          "
        >
          💰 BUY $100
        </button>
        <button
          onClick={handleAddToWatchlist}
          className="
            bg-slate-600 hover:bg-slate-500 
            text-white font-semibold py-2 px-3 rounded-lg 
            transition-all transform hover:scale-105
            text-sm
          "
        >
          ⭐ Watch
        </button>
      </div>

      {/* Score Progress Bar */}
      <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-500" 
          style={{ width: `${Math.min(candidate.score, 100)}%` }}
        />
      </div>
    </div>
  );
});

CandidateCard.displayName = 'CandidateCard';

// Custom hook for API data fetching with caching and error boundaries
const useAlphaStackData = (autoRefresh: boolean, refreshInterval: number) => {
  const [data, setData] = useState<AlphaStackCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      
      setLoading(true);
      setError(null);

      const response = await fetch('/api/v2/scan/squeeze', {
        signal: abortControllerRef.current.signal,
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: AlphaStackResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setData(result.results || []);
      setLastUpdate(new Date());
      
      console.log(`✅ AlphaStackV3: Loaded ${result.results?.length || 0} candidates from ${result.source}`);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }
      
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      console.error('❌ AlphaStackV3 fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    fetchData();

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, loading, error, lastUpdate, refetch: fetchData };
};

// Error Boundary Component
class AlphaStackErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AlphaStackV3 Error Boundary:', error, errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-red-400 mb-2">Component Error</h3>
          <p className="text-red-300 text-sm mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main AlphaStackV3 Component
export const AlphaStackV3: React.FC<AlphaStackV3Props> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  onCandidateSelect,
  onError,
}) => {
  // Feature flag check - graceful fallback
  const isV3Enabled = useMemo(() => {
    try {
      return shouldUseV3();
    } catch {
      return false; // Fallback if feature flags module fails
    }
  }, []);

  const { data, loading, error, lastUpdate, refetch } = useAlphaStackData(
    autoRefresh && isV3Enabled,
    refreshInterval
  );

  // Handle errors via prop callback
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Memoized statistics
  const stats = useMemo(() => {
    if (!data.length) return { count: 0, avgScore: 0, highConfidence: 0 };
    
    const avgScore = data.reduce((sum, item) => sum + item.score, 0) / data.length;
    const highConfidence = data.filter(item => item.score >= 75).length;
    
    return {
      count: data.length,
      avgScore: Math.round(avgScore),
      highConfidence,
    };
  }, [data]);

  // Virtualization for large lists (simple implementation)
  const visibleData = useMemo(() => {
    return data.slice(0, 50); // Limit to 50 items for performance
  }, [data]);

  // Loading state
  if (loading && !data.length) {
    return (
      <div className={`alphastack-v3 ${className}`}>
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-8 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mb-4"></div>
          <div className="text-lg font-bold text-white mb-2">Loading AlphaStack Data...</div>
          <div className="text-slate-300 text-sm">Fetching real-time opportunities</div>
        </div>
      </div>
    );
  }

  // Error state with retry
  if (error && !data.length) {
    return (
      <div className={`alphastack-v3 ${className}`}>
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">❌</div>
          <h3 className="text-lg font-bold text-red-400 mb-2">Load Error</h3>
          <p className="text-red-300 text-sm mb-4">{error.message}</p>
          <button
            onClick={refetch}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Fallback mode (V2)
  if (!isV3Enabled) {
    return (
      <div className={`alphastack-v3 ${className}`}>
        <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">🔄</div>
          <h3 className="text-lg font-bold text-yellow-400 mb-2">V2 Fallback Mode</h3>
          <p className="text-yellow-300 text-sm">AlphaStack V3 is disabled. Using legacy interface.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`alphastack-v3 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-1 flex items-center">
            🎯 AlphaStack V3
            <span className="ml-2 text-xs px-2 py-1 rounded bg-blue-700 text-blue-200">
              LIVE
            </span>
            {loading && (
              <span className="ml-2 text-xs px-2 py-1 rounded bg-yellow-700 text-yellow-200">
                UPDATING
              </span>
            )}
          </h2>
          <p className="text-slate-300 text-xs">
            High-performance screening with real-time data and advanced analytics
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={refetch}
            disabled={loading}
            className="
              bg-blue-600 hover:bg-blue-700 disabled:opacity-50 
              px-3 py-2 rounded-lg font-medium transition-colors 
              flex items-center text-sm
            "
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span className="ml-1">Refresh</span>
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="flex justify-center space-x-6 mb-6 text-xs text-slate-400">
        <div>{stats.count} candidates</div>
        <div>Avg Score: {stats.avgScore}</div>
        <div>{stats.highConfidence} high confidence</div>
        {lastUpdate && (
          <div>Updated: {lastUpdate.toLocaleTimeString()}</div>
        )}
      </div>

      {/* Empty State */}
      {!data.length ? (
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-bold text-white mb-2">No Opportunities Found</h3>
          <p className="text-slate-300 mb-4">The AlphaStack engine found no candidates matching current criteria</p>
          <button
            onClick={refetch}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Refresh Scan
          </button>
        </div>
      ) : (
        /* Results Grid - Mobile-first responsive */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {visibleData.map((candidate) => (
            <CandidateCard
              key={candidate.ticker}
              candidate={candidate}
              onSelect={onCandidateSelect}
            />
          ))}
        </div>
      )}

      {/* Show truncation notice if needed */}
      {data.length > visibleData.length && (
        <div className="text-center mt-6 text-slate-400 text-sm">
          Showing {visibleData.length} of {data.length} candidates
          <br />
          <span className="text-xs">Optimized for performance - adjust filters to see more</span>
        </div>
      )}
    </div>
  );
};

// Wrapped component with error boundary
export const AlphaStackV3WithErrorBoundary: React.FC<AlphaStackV3Props> = (props) => {
  return (
    <AlphaStackErrorBoundary onError={props.onError}>
      <AlphaStackV3 {...props} />
    </AlphaStackErrorBoundary>
  );
};

export default AlphaStackV3WithErrorBoundary;