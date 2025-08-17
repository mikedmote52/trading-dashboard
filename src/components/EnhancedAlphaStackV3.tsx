/**
 * Enhanced AlphaStack V3 Component
 * Demonstrates integration of fault-tolerant API system with existing UI
 */

import React, { useCallback, useState } from 'react';
import { useEnhancedAlphaStackData, useAlphaStackHealth, useAlphaStackAlerts } from '../hooks/useEnhancedAlphaStackData';
import type { AlphaStackCandidate } from '../types/alphastack';
import { isEnabled } from '../config/feature-flags';

interface EnhancedAlphaStackV3Props {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  maxDisplayItems?: number;
  onCandidateSelect?: (candidate: AlphaStackCandidate) => void;
  onError?: (error: Error) => void;
}

export const EnhancedAlphaStackV3: React.FC<EnhancedAlphaStackV3Props> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 30000,
  maxDisplayItems = 20,
  onCandidateSelect,
  onError
}) => {
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Enhanced data hook with full fault tolerance
  const {
    data,
    loading,
    error,
    connectionState,
    healthScore,
    performanceMetrics,
    stats,
    retry,
    resetConnection,
    clearErrors,
    systemStatus,
    isStale
  } = useEnhancedAlphaStackData({
    autoRefresh,
    refreshInterval,
    realTimeUpdates: isEnabled('V3_REAL_TIME_UPDATES'),
    errorRecovery: isEnabled('V3_ERROR_BOUNDARIES'),
    performanceTracking: isEnabled('PERFORMANCE_MONITORING'),
    backgroundRefresh: isEnabled('V3_PERFORMANCE_MODE'),
    visibilityOptimization: true
  });

  // System health monitoring
  const health = useAlphaStackHealth();
  
  // Performance alerts
  const { alerts, dismissAlert } = useAlphaStackAlerts();

  // Handle candidate selection
  const handleCandidateClick = useCallback((candidate: AlphaStackCandidate) => {
    onCandidateSelect?.(candidate);
  }, [onCandidateSelect]);

  // Handle errors
  React.useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Display candidates (limited by maxDisplayItems)
  const displayCandidates = data.slice(0, maxDisplayItems);

  // Get status indicator color
  const getStatusColor = (status: string, score: number) => {
    if (status === 'unhealthy' || score < 50) return 'text-red-500 bg-red-50';
    if (status === 'degraded' || score < 85) return 'text-yellow-500 bg-yellow-50';
    return 'text-green-500 bg-green-50';
  };

  // Connection state indicator
  const getConnectionIndicator = () => {
    const indicators = {
      connected: { emoji: '🟢', text: 'Connected' },
      connecting: { emoji: '🟡', text: 'Connecting...' },
      disconnected: { emoji: '🔴', text: 'Disconnected' },
      error: { emoji: '❌', text: 'Error' }
    };
    return indicators[connectionState] || indicators.disconnected;
  };

  return (
    <div className={`enhanced-alphastack-v3 ${className}`}>
      {/* Header with health indicators */}
      <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-bold text-gray-800">
            AlphaStack V3 Enhanced
          </h2>
          
          {/* Connection Status */}
          <div className="flex items-center space-x-2">
            <span>{getConnectionIndicator().emoji}</span>
            <span className="text-sm text-gray-600">
              {getConnectionIndicator().text}
            </span>
          </div>

          {/* Health Score */}
          {isEnabled('PERFORMANCE_MONITORING') && (
            <div className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(systemStatus.status, healthScore)}`}>
              Health: {healthScore}/100
            </div>
          )}

          {/* Data Stats */}
          <div className="text-sm text-gray-600">
            {stats.count} candidates
            {stats.highConfidence > 0 && (
              <span className="ml-2 text-green-600 font-medium">
                {stats.highConfidence} high confidence
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          {/* Refresh Button */}
          <button
            onClick={() => retry()}
            disabled={loading}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              loading 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          {/* Diagnostics Toggle */}
          {isEnabled('DEBUG_MODE') && (
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="px-3 py-1 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
            </button>
          )}
        </div>
      </div>

      {/* Performance Alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded flex items-center justify-between ${
                alert.level === 'critical' 
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
              }`}
            >
              <span className="text-sm">{alert.message}</span>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="text-sm underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && systemStatus.status === 'unhealthy' && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-red-800 font-medium">Connection Error</h3>
              <p className="text-red-600 text-sm mt-1">{systemStatus.message}</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={clearErrors}
                className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
              >
                Clear
              </button>
              <button
                onClick={resetConnection}
                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              >
                Reset Connection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stale Data Warning */}
      {isStale && data.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          ⚠️ Data may be stale. Last update: {stats.lastUpdate?.toLocaleTimeString()}
        </div>
      )}

      {/* Diagnostics Panel */}
      {showDiagnostics && isEnabled('DEBUG_MODE') && (
        <div className="mb-4 p-4 bg-gray-100 rounded-lg text-sm">
          <h3 className="font-medium mb-2">System Diagnostics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-gray-600">Response Time</div>
              <div className="font-medium">{performanceMetrics.responseTime}ms</div>
            </div>
            <div>
              <div className="text-gray-600">Success Rate</div>
              <div className="font-medium">{performanceMetrics.successRate}%</div>
            </div>
            <div>
              <div className="text-gray-600">Cache Hit Rate</div>
              <div className="font-medium">{performanceMetrics.cacheHitRate}%</div>
            </div>
            <div>
              <div className="text-gray-600">Error Rate</div>
              <div className="font-medium">{performanceMetrics.errorRate}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && data.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-gray-600">Loading AlphaStack candidates...</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && data.length === 0 && !error && (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-2">📊</div>
          <p className="text-gray-600">No candidates found</p>
          <button
            onClick={() => retry()}
            className="mt-2 text-blue-500 hover:text-blue-600 text-sm underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Candidates Grid */}
      {displayCandidates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayCandidates.map((candidate) => (
            <div
              key={candidate.ticker}
              onClick={() => handleCandidateClick(candidate)}
              className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-lg">{candidate.ticker}</h3>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  candidate.score >= 75 ? 'bg-green-100 text-green-800' :
                  candidate.score >= 50 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {candidate.score}
                </div>
              </div>

              {/* Price and Change */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl font-semibold">
                  ${candidate.price.toFixed(2)}
                </span>
                <span className={`text-sm font-medium ${
                  candidate.changePct >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {candidate.changePct >= 0 ? '+' : ''}{candidate.changePct.toFixed(2)}%
                </span>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                <div>
                  <span className="block text-gray-500">RVOL</span>
                  <span className="font-medium">{candidate.rvol.toFixed(1)}x</span>
                </div>
                <div>
                  <span className="block text-gray-500">Short%</span>
                  <span className="font-medium">{candidate.shortPct.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="block text-gray-500">Float</span>
                  <span className="font-medium">{candidate.floatM.toFixed(1)}M</span>
                </div>
                <div>
                  <span className="block text-gray-500">Borrow</span>
                  <span className="font-medium">{candidate.borrowFeePct.toFixed(1)}%</span>
                </div>
              </div>

              {/* Plan */}
              <div className="text-xs text-gray-700">
                <div className="font-medium mb-1">Entry Strategy</div>
                <div className="line-clamp-2">{candidate.plan.entry}</div>
              </div>

              {/* Catalyst */}
              {candidate.catalyst.type && (
                <div className="mt-2 text-xs">
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    {candidate.catalyst.type}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer with refresh info */}
      {stats.lastUpdate && (
        <div className="mt-4 text-center text-xs text-gray-500">
          Last updated: {stats.lastUpdate.toLocaleString()}
          {isStale && <span className="text-yellow-600 ml-2">(Stale)</span>}
        </div>
      )}
    </div>
  );
};

export default EnhancedAlphaStackV3;