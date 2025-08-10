// Simple semaphore limiter: CJS-safe, no deps
function makeLimiter(concurrency = 1) {
  let active = 0;
  const q = [];
  const run = () => {
    if (active >= concurrency) return;
    const next = q.shift();
    if (!next) return;
    active++;
    Promise.resolve()
      .then(next.fn)
      .then(v => { active--; next.resolve(v); run(); })
      .catch(err => { active--; next.reject(err); run(); });
  };
  return fn => new Promise((resolve, reject) => {
    q.push({ fn, resolve, reject });
    run();
  });
}
const withLimit = makeLimiter(1); // 1 req in flight per host

const borrowProvider = require('../providers/borrow');
const catalystProvider = require('../providers/catalysts');
const shortInterestProvider = require('../providers/shortinterest');
const fundamentalsProvider = require('../providers/fundamentals');
const liquidityProvider = require('../providers/liquidity');

async function batch(tickers, fn) {
  const out = {};
  await Promise.all(
    tickers.map(tk =>
      withLimit(async () => {
        try {
          const v = await fn(tk);
          if (v) out[tk] = v;
        } catch (_) {}
      })
    )
  );
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
      let symbols = [];
      
      if (assets && Array.isArray(assets)) {
        // Filter for liquid stocks only
        symbols = assets
          .filter(a => a.exchange === 'NASDAQ' || a.exchange === 'NYSE')
          .filter(a => a.symbol && !a.symbol.includes('.'))
          .map(a => a.symbol)
          .slice(0, 100); // Reduced for testing
      }
      
      // Add test symbols if configured via env var
      const testList = (process.env.ENGINE_TEST_SYMBOLS || '')
        .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      if (testList.length) {
        // Replace with test symbols in development/testing
        return testList;
      }
      
      return symbols;
    } catch (e) {
      console.error('Error fetching universe:', e);
      
      // Only fallback to test symbols if explicitly configured
      const testList = (process.env.ENGINE_TEST_SYMBOLS || '')
        .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      if (testList.length) return testList;
      
      // Otherwise return empty array to let gates handle properly
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
    const result = {};
    
    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          // Get short interest data
          const siData = await shortInterestProvider.get(ticker);
          if (siData) {
            result[ticker] = {
              short_interest_shares: siData.short_interest_shares,
              short_interest_pct: siData.short_interest_pct,
              days_to_cover: siData.days_to_cover,
              freshness: {
                short_interest_age_days: siData.asof ? 
                  Math.floor((Date.now() - new Date(siData.asof)) / (1000 * 60 * 60 * 24)) : 99
              }
            };
          }
          
          // Get fundamentals data for float shares
          const fundData = await fundamentalsProvider.get(ticker);
          if (fundData) {
            if (!result[ticker]) result[ticker] = {};
            result[ticker].float_shares = fundData.float_shares;
          }
        } catch (e) {
          // Skip this ticker if fetch fails
        }
      })
    );
    
    return result;
  },

  async get_liquidity(tickers) {
    const result = {};
    
    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const liqData = await liquidityProvider.get(ticker);
          if (liqData) {
            result[ticker] = {
              avg_dollar_liquidity_30d: liqData.liquidity_30d,
              adv_30d_shares: liqData.adv_30d_shares
            };
          }
        } catch (e) {
          // Skip this ticker if fetch fails
        }
      })
    );
    
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
    const result = {};
    
    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const catalystData = await catalystProvider.get(ticker);
          if (catalystData) {
            result[ticker] = catalystData;
          }
        } catch (e) {
          // Skip this ticker if fetch fails
        }
      })
    );
    
    return result;
  },

  async get_sentiment(tickers) {
    // Sentiment data not currently available - gates will handle
    return {};
  },

  async get_borrow(tickers) {
    const result = {};
    
    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const borrowData = await borrowProvider.get(ticker);
          if (borrowData) {
            result[ticker] = borrowData;
          }
        } catch (e) {
          // Skip this ticker if fetch fails
        }
      })
    );
    
    return result;
  }
};