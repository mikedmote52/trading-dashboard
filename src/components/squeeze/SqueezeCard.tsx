import React, { useState } from 'react';
import { OrderButtons } from './OrderButtons';

interface SqueezeCardProps {
  recommendation: {
    ticker: string;
    score: number;
    price: number;
    action: string;
    thesis: {
      momentum: number;
      squeeze: number;
      catalyst: number;
      sentiment: number;
      technical: number;
    };
    targets: {
      entry: string;
      tp1: string;
      tp2: string;
      stop: string;
    };
    price_data: {
      current: number;
      change: number;
      change_percent: number;
      high: number;
      low: number;
      vwap: number;
      volume: number;
      is_live_data?: boolean;
    };
    intraday: {
      rvol: number;
      vwap_reclaimed: boolean;
      change_percent: number;
    };
  };
  onOrderExecuted?: () => void;
}

export const SqueezeCard: React.FC<SqueezeCardProps> = ({ 
  recommendation, 
  onOrderExecuted 
}) => {
  const [expanded, setExpanded] = useState(false);
  
  const { ticker, score, action, thesis, targets, price_data, intraday } = recommendation;
  
  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return 'bg-green-100 text-green-800 border-green-200';
      case 'EARLY_READY': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'PRE_BREAKOUT': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'WATCHLIST': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };
  
  const formatPrice = (price: number) => {
    return price >= 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(3)}`;
  };
  
  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const ThesisPieChart = ({ data }: { data: typeof thesis }) => {
    const total = Object.values(data).reduce((sum, val) => sum + val, 0);
    const segments = Object.entries(data).map(([key, value]) => ({
      label: key,
      value,
      percentage: (value / total) * 100
    }));
    
    let cumulativePercentage = 0;
    
    return (
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 transform -rotate-90">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {segments.map((segment, index) => {
            const strokeDasharray = `${segment.percentage * 1.76} 176`;
            const strokeDashoffset = -cumulativePercentage * 1.76;
            cumulativePercentage += segment.percentage;
            
            const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
            
            return (
              <circle
                key={segment.label}
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth="8"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold">{score}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-lg">{ticker}</h3>
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getActionColor(action)}`}>
            {action}
          </span>
          {price_data.is_live_data && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
              LIVE
            </span>
          )}
        </div>
        <ThesisPieChart data={thesis} />
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <div className="text-2xl font-bold">{formatPrice(price_data.current)}</div>
          <div className={`text-sm ${price_data.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatPercent(price_data.change_percent)} today
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">Volume</div>
          <div className="font-semibold">{(price_data.volume / 1000000).toFixed(1)}M</div>
          <div className="text-xs text-gray-500">{intraday.rvol.toFixed(1)}x avg</div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="text-center">
          <div className="text-gray-500">High</div>
          <div className="font-semibold">{formatPrice(price_data.high)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">VWAP</div>
          <div className={`font-semibold ${intraday.vwap_reclaimed ? 'text-green-600' : 'text-red-600'}`}>
            {formatPrice(price_data.vwap)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">Low</div>
          <div className="font-semibold">{formatPrice(price_data.low)}</div>
        </div>
      </div>

      {/* Targets */}
      <div className="bg-gray-50 rounded-lg p-3 mb-3">
        <div className="text-xs font-medium text-gray-700 mb-2">Targets</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-500">TP1</div>
            <div className="font-semibold text-green-600">{targets.tp1}</div>
          </div>
          <div>
            <div className="text-gray-500">TP2</div>
            <div className="font-semibold text-green-600">{targets.tp2}</div>
          </div>
          <div>
            <div className="text-gray-500">Stop</div>
            <div className="font-semibold text-red-600">{targets.stop}</div>
          </div>
        </div>
      </div>

      {/* Expandable Thesis Details */}
      {expanded && (
        <div className="bg-blue-50 rounded-lg p-3 mb-3">
          <div className="text-xs font-medium text-blue-700 mb-2">Thesis Breakdown</div>
          <div className="space-y-1 text-xs">
            {Object.entries(thesis).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="capitalize text-gray-600">{key}:</span>
                <span className="font-semibold">{value} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
        
        <OrderButtons
          ticker={ticker}
          price={price_data.current}
          action={action}
          onOrderExecuted={onOrderExecuted}
        />
      </div>
    </div>
  );
};