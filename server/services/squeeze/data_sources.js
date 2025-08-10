/**
 * Data Sources Adapter for Squeeze Engine
 * Leverages existing providers for real data fetching
 */

const https = require('https');

// Reuse existing Alpaca connection from server.js
function makeAlpacaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.APCA_API_KEY_ID;
    const secretKey = process.env.APCA_API_SECRET_KEY;
    const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
    
    if (!apiKey || !secretKey) {
      resolve(null);
      return;
    }

    const url = new URL(baseUrl);
    const options = {
      hostname: url.hostname,
      path: `/v2/${endpoint}`,
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            resolve(null);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => resolve(null));
    req.end();
  });
}

module.exports = {
  /**
   * Get universe of tradeable symbols
   * Returns array of ticker strings
   */
  async get_universe() {
    try {
      const assets = await makeAlpacaRequest('assets?status=active&tradable=true');
      if (!assets || !Array.isArray(assets)) return [];
      
      // Filter for liquid stocks only
      return assets
        .filter(a => a.exchange === 'NASDAQ' || a.exchange === 'NYSE')
        .filter(a => a.symbol && !a.symbol.includes('.'))
        .map(a => a.symbol)
        .slice(0, 500); // Limit to top 500 for performance
    } catch (e) {
      console.error('Error fetching universe:', e);
      return [];
    }
  },

  /**
   * Get current portfolio holdings from Alpaca
   * Returns Set of ticker symbols
   */
  async get_portfolio_holdings() {
    try {
      const positions = await makeAlpacaRequest('positions');
      if (!positions || !Array.isArray(positions)) return new Set();
      
      return new Set(positions.map(p => p.symbol));
    } catch (e) {
      console.error('Error fetching holdings:', e);
      return new Set();
    }
  },

  /**
   * Get short interest and borrow data
   * Returns map[ticker] -> short data object
   */
  async get_short_data(tickers) {
    const result = {};
    
    // Check if borrow provider is configured
    if (!process.env.BORROW_SHORT_PROVIDER) {
      // Return empty map - gates will drop these tickers
      return result;
    }

    try {
      const { getBorrowData } = require('../providers/borrow');
      
      // Batch fetch with rate limiting
      for (const ticker of tickers.slice(0, 20)) { // Limit to prevent rate limiting
        try {
          const data = await getBorrowData(ticker);
          if (data) {
            result[ticker] = {
              float_shares: data.float_shares || null,
              short_interest_pct: data.short_interest_pct || null,
              utilization_pct: data.utilization_pct || null,
              borrow_fee_pct: data.borrow_fee_pct || null,
              borrow_fee_trend_pp7d: data.fee_change_7d || null,
              days_to_cover: data.days_to_cover || null,
              freshness: {
                short_interest_age_days: data.asof ? 
                  Math.floor((Date.now() - new Date(data.asof)) / (1000 * 60 * 60 * 24)) : 99
              }
            };
          }
        } catch (e) {
          // Skip this ticker if fetch fails
          continue;
        }
      }
    } catch (e) {
      console.error('Error in get_short_data:', e);
    }
    
    return result;
  },

  /**
   * Get 30-day average dollar liquidity
   * Returns map[ticker] -> liquidity data
   */
  async get_liquidity(tickers) {
    const result = {};
    
    try {
      // Use Polygon if available, otherwise skip
      if (!process.env.POLYGON_API_KEY) return result;
      
      // Stub for now - would fetch from Polygon aggregates
      // This would calculate avg(volume * vwap) over 30 days
      for (const ticker of tickers) {
        // Placeholder - gates will drop tickers without liquidity data
        result[ticker] = null;
      }
    } catch (e) {
      console.error('Error fetching liquidity:', e);
    }
    
    return result;
  },

  /**
   * Get intraday technical indicators
   * Returns map[ticker] -> technical data
   */
  async get_intraday(tickers) {
    const result = {};
    
    try {
      const { getLastTrade, getQuote } = require('../providers/prices');
      
      for (const ticker of tickers.slice(0, 50)) { // Limit for performance
        try {
          const [trade, quote] = await Promise.all([
            getLastTrade(ticker),
            getQuote(ticker)
          ]);
          
          if (trade && quote) {
            result[ticker] = {
              price: trade.price,
              vwap: null, // Would need intraday bars to calculate
              ema9: null, // Would need historical data
              ema20: null, // Would need historical data
              atr_pct: null, // Would need historical data
              rsi: null, // Would need historical data
              rel_volume: null, // Would need avg volume
              vwap_held_or_reclaimed: false // Would need VWAP calculation
            };
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      console.error('Error fetching intraday:', e);
    }
    
    return result;
  },

  /**
   * Get options flow data
   * Returns map[ticker] -> options data
   */
  async get_options(tickers) {
    const result = {};
    // Options data not currently available - gates will handle
    return result;
  },

  /**
   * Get catalyst data
   * Returns map[ticker] -> catalyst info
   */
  async get_catalysts(tickers) {
    const result = {};
    // Catalyst data not currently available - gates will handle
    return result;
  },

  /**
   * Get sentiment scores
   * Returns map[ticker] -> sentiment data
   */
  async get_sentiment(tickers) {
    const result = {};
    // Sentiment data not currently available - gates will handle
    return result;
  }
};