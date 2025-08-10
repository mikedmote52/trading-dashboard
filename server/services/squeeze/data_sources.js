const pLimit = require('p-limit');
const { getBorrowFor } = require('../providers/borrow');
const { getCatalystFor } = require('../providers/catalysts');

const limit = pLimit(1); // 1 rps per external domain; adjust if you add queues per host

async function batch(tickers, fn) {
  const out = {};
  await Promise.all(tickers.map(tk => limit(async () => {
    try { const v = await fn(tk); if (v) out[tk] = v; } catch {}
  })));
  return out;
}

// Reuse existing Alpaca connection from server.js
function makeAlpacaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const https = require('https');
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
  async get_universe() {
    try {
      const assets = await makeAlpacaRequest('assets?status=active&tradable=true');
      if (!assets || !Array.isArray(assets)) return [];
      
      // Filter for liquid stocks only
      return assets
        .filter(a => a.exchange === 'NASDAQ' || a.exchange === 'NYSE')
        .filter(a => a.symbol && !a.symbol.includes('.'))
        .map(a => a.symbol)
        .slice(0, 100); // Reduced for testing
    } catch (e) {
      console.error('Error fetching universe:', e);
      return [];
    }
  },

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

  async get_short_data(tickers) {
    // Use existing short data providers if available
    const result = {};
    
    try {
      // Check for existing borrow provider
      if (process.env.BORROW_SHORT_PROVIDER) {
        const { getBorrowData } = require('../providers/borrow');
        
        for (const ticker of tickers.slice(0, 20)) { // Limit to prevent rate limiting
          try {
            const data = await getBorrowData(ticker);
            if (data) {
              result[ticker] = {
                float_shares: data.float_shares || null,
                short_interest_pct: data.short_interest_pct || null,
                utilization_pct: data.utilization_pct || null,
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
      }
    } catch (e) {
      console.error('Error in get_short_data:', e);
    }
    
    return result;
  },

  async get_liquidity(tickers) {
    // Stub implementation - would calculate 30-day avg dollar volume
    const result = {};
    
    if (!process.env.POLYGON_API_KEY) return result;
    
    // For now, return empty - gates will drop these tickers
    return result;
  },

  async get_intraday(tickers) {
    const result = {};
    
    try {
      const { getLastTrade, getQuote } = require('../providers/prices');
      
      for (const ticker of tickers.slice(0, 20)) { // Reduced limit for testing
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

  async get_options(tickers) {
    // Options data not currently available - gates will handle
    return {};
  },

  async get_catalysts(tickers) {
    return await batch(tickers, getCatalystFor);
  },

  async get_sentiment(tickers) {
    // Sentiment data not currently available - gates will handle
    return {};
  },

  async get_borrow(tickers) {
    return await batch(tickers, getBorrowFor);
  }
};