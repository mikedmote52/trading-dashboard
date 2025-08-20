import React, { useState } from 'react';

interface OrderButtonsProps {
  ticker: string;
  price: number;
  action: string;
  onOrderExecuted?: () => void;
}

export const OrderButtons: React.FC<OrderButtonsProps> = ({ 
  ticker, 
  price, 
  action, 
  onOrderExecuted 
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const executeOrder = async (orderAction: 'BUY' | 'SELL') => {
    setLoading(true);
    setStatus('idle');
    
    try {
      const usdAmount = orderAction === 'BUY' ? 
        Math.min(150, Math.floor(100 / price) * price) : // Buy up to $150 or 100 shares worth
        100; // Default sell amount
      
      const response = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker,
          usd_amount: usdAmount,
          current_price: price,
          tp1_pct: 0.15, // 15%
          tp2_pct: 0.30, // 30%
          stop_pct: 0.08 // 8%
        })
      });

      const result = await response.json();
      
      if (result.ok) {
        setStatus('success');
        onOrderExecuted?.();
        
        // Auto-reset after 3 seconds
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
        console.error('Order failed:', result.error);
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (error) {
      setStatus('error');
      console.error('Order execution error:', error);
      setTimeout(() => setStatus('idle'), 3000);
    }
    
    setLoading(false);
  };

  const getBuyButtonText = () => {
    if (loading) return 'Placing...';
    if (status === 'success') return 'Bought ✅';
    if (status === 'error') return 'Failed ❌';
    
    const shares = Math.floor(100 / price);
    return `Buy ${shares} shares`;
  };

  const getSellButtonText = () => {
    if (loading) return 'Selling...';
    if (status === 'success') return 'Sold ✅';
    if (status === 'error') return 'Failed ❌';
    return 'Sell Position';
  };

  const getButtonStyle = (buttonAction: 'BUY' | 'SELL') => {
    const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50";
    
    if (status === 'success') {
      return `${baseStyle} bg-green-500 text-white`;
    }
    if (status === 'error') {
      return `${baseStyle} bg-red-500 text-white`;
    }
    
    if (buttonAction === 'BUY') {
      const isPrimary = action === 'BUY';
      return isPrimary ? 
        `${baseStyle} bg-green-600 hover:bg-green-700 text-white shadow-lg` :
        `${baseStyle} bg-green-100 hover:bg-green-200 text-green-800 border border-green-300`;
    } else {
      return `${baseStyle} bg-red-100 hover:bg-red-200 text-red-800 border border-red-300`;
    }
  };

  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={() => executeOrder('BUY')}
        disabled={loading}
        className={getButtonStyle('BUY')}
      >
        {getBuyButtonText()}
      </button>
      
      <button
        onClick={() => executeOrder('SELL')}
        disabled={loading}
        className={getButtonStyle('SELL')}
      >
        {getSellButtonText()}
      </button>
    </div>
  );
};