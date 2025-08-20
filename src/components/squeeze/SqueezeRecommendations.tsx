import React, { useState, useEffect, useMemo } from 'react';
import { SqueezeCard } from './SqueezeCard';

interface SqueezeRecommendationsProps {
  showFilters?: boolean;
  onCopyJson?: (recommendation: any) => void;
}

export const SqueezeRecommendations: React.FC<SqueezeRecommendationsProps> = ({
  showFilters = true,
  onCopyJson
}) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('BUY');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchRecommendations = async () => {
    try {
      setError(null);
      const response = await fetch('/api/discoveries/latest-scores');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        setData(result.data);
        setLastUpdated(new Date());
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
      setError(error.message || 'Failed to fetch recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchRecommendations, 30000);
    return () => clearInterval(interval);
  }, []);

  const groupedData = useMemo(() => {
    const groups = {
      BUY: data.filter(item => item.action === 'BUY'),
      EARLY_READY: data.filter(item => item.action === 'EARLY_READY'),
      PRE_BREAKOUT: data.filter(item => item.action === 'PRE_BREAKOUT'), 
      WATCHLIST: data.filter(item => item.action === 'WATCHLIST' || item.action === 'MONITOR')
    };
    
    // Sort each group by score descending
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => (b.score || 0) - (a.score || 0));
    });
    
    return groups;
  }, [data]);

  const getTabColor = (tab: string) => {
    const colors = {
      BUY: 'border-green-500 text-green-600',
      EARLY_READY: 'border-blue-500 text-blue-600',
      PRE_BREAKOUT: 'border-yellow-500 text-yellow-600',
      WATCHLIST: 'border-gray-500 text-gray-600'
    };
    return colors[tab] || colors.WATCHLIST;
  };

  const getTabLabel = (tab: string, count: number) => {
    const labels = {
      BUY: `BUY (${count})`,
      EARLY_READY: `Early Ready (${count})`,
      PRE_BREAKOUT: `Pre-Breakout (${count})`,
      WATCHLIST: `Watchlist (${count})`
    };
    return labels[tab] || `${tab} (${count})`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading recommendations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="text-red-600 mr-3">⚠️</div>
          <div>
            <h3 className="text-red-800 font-medium">Error Loading Recommendations</h3>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button 
              onClick={fetchRecommendations}
              className="text-red-700 hover:text-red-900 text-sm underline mt-2"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Enhanced Squeeze Recommendations</h2>
          <p className="text-gray-600 mt-1">
            {data.length} discoveries powered by AlphaStack engine
            {lastUpdated && (
              <span className="ml-2 text-sm">
                • Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        
        <button
          onClick={fetchRecommendations}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {Object.entries(groupedData).map(([tab, items]) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === tab
                  ? getTabColor(tab)
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {getTabLabel(tab, items.length)}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div>
        {groupedData[selectedTab]?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedData[selectedTab].map((recommendation, index) => (
              <SqueezeCard
                key={`${recommendation.ticker}-${index}`}
                recommendation={recommendation}
                onOrderExecuted={fetchRecommendations}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No {selectedTab.toLowerCase().replace('_', ' ')} recommendations
            </h3>
            <p className="text-gray-600">
              Try checking other tabs or refresh to load new discoveries.
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {data.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Discovery Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Total Discoveries</div>
              <div className="font-semibold text-lg">{data.length}</div>
            </div>
            <div>
              <div className="text-gray-500">High Confidence (≥70)</div>
              <div className="font-semibold text-lg text-green-600">
                {data.filter(item => item.score >= 70).length}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Live Data</div>
              <div className="font-semibold text-lg text-blue-600">
                {data.filter(item => item.price_data?.is_live_data).length}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Avg Score</div>
              <div className="font-semibold text-lg">
                {(data.reduce((sum, item) => sum + (item.score || 0), 0) / data.length).toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};