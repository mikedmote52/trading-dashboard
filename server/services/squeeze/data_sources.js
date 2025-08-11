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

// New estimation systems
const ShortInterestEstimator = require('../providers/short_interest_estimator');
const CatalystEstimator = require('../providers/catalyst_estimator');

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
    
    // First get fundamentals and liquidity for all tickers to build context
    const [fundResults, liqResults, borrowResults] = await Promise.all([
      batch(tickers, tk => fundamentalsProvider.get(tk)),
      batch(tickers, tk => liquidityProvider.get(tk)),
      batch(tickers, tk => borrowProvider.get(tk))
    ]);
    
    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          // Build context for proxy if needed
          const ctx = {
            float_shares: fundResults[ticker]?.float_shares,
            adv_30d_shares: liqResults[ticker]?.adv_30d_shares,
            borrow_fee_pct: borrowResults[ticker]?.borrow_fee_pct,
            borrow_fee_trend_pp7d: borrowResults[ticker]?.borrow_fee_trend_pp7d
          };
          
          // Try getWithContext first (will use proxy if needed), fallback to get()
          let siData = null;
          try {
            siData = await shortInterestProvider.getWithContext(ticker, ctx);
          } catch (proxyErr) {
            // If proxy fails, try fallback to cached data
            console.warn(`Proxy failed for ${ticker}, trying cached data:`, proxyErr.message);
            try {
              siData = await shortInterestProvider.get(ticker);
            } catch (cacheErr) {
              console.warn(`Both proxy and cache failed for ${ticker}:`, cacheErr.message);
            }
          }
                         
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
          } else {
            // Use estimation system when real data unavailable
            try {
              const marketData = await this.buildMarketDataForEstimation(ticker, fundResults, liqResults);
              const estimated = ShortInterestEstimator.generateMetrics(marketData);
              
              result[ticker] = {
                short_interest_shares: Math.round((marketData.float_shares || 50000000) * estimated.short_interest_pct / 100),
                short_interest_pct: estimated.short_interest_pct,
                days_to_cover: estimated.days_to_cover,
                freshness: {
                  short_interest_age_days: 0 // Fresh estimation
                },
                estimated: true,
                estimation_confidence: estimated.estimation_confidence
              };
              
              console.log(`📈 Estimated short data for ${ticker}: ${estimated.short_interest_pct}% SI, ${estimated.days_to_cover} DTC`);
            } catch (estErr) {
              console.warn(`Failed to estimate short data for ${ticker}:`, estErr.message);
            }
          }
          
          // Include fundamentals data as well
          if (fundResults[ticker]) {
            if (!result[ticker]) result[ticker] = {};
            result[ticker].float_shares = fundResults[ticker].float_shares;
          }
        } catch (e) {
          // Skip this ticker if fetch fails
        }
      })
    );
    
    return result;
  },

  async buildMarketDataForEstimation(ticker, fundResults, liqResults) {
    // Get intraday data for price and volume
    const intradayData = await this.get_intraday([ticker]);
    const technicals = intradayData[ticker] || {};
    
    return {
      symbol: ticker,
      price: technicals.price || 50, // Default price if missing
      volume_today: technicals.volume || 1000000,
      avg_volume_30d: liqResults[ticker]?.adv_30d_shares || 500000,
      rsi: technicals.rsi || 50, // Default neutral RSI
      price_change_30d_pct: technicals.price_change_30d_pct || 0,
      price_change_1d_pct: technicals.price_change_1d_pct || 0,
      price_change_5d_pct: technicals.price_change_5d_pct || 0,
      volatility_30d: technicals.volatility_30d || 30,
      float_shares: fundResults[ticker]?.float_shares || 50000000,
      market_cap: (technicals.price || 50) * (fundResults[ticker]?.shares_outstanding || 100000000)
    };
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
          // Try real catalyst provider first
          const catalystData = await catalystProvider.get(ticker);
          if (catalystData) {
            result[ticker] = catalystData;
          } else {
            // Use estimation system as fallback
            const marketData = await this.buildMarketDataForEstimation(ticker, {}, {});
            const estimated = CatalystEstimator.generateCatalyst(marketData);
            result[ticker] = estimated;
            console.log(`🔍 Estimated catalyst for ${ticker}: ${estimated.type} (${estimated.description})`);
          }
        } catch (e) {
          // Still provide fallback even on error
          try {
            const marketData = await this.buildMarketDataForEstimation(ticker, {}, {});
            const estimated = CatalystEstimator.generateCatalyst(marketData);
            result[ticker] = estimated;
          } catch (estErr) {
            console.warn(`Failed to estimate catalyst for ${ticker}:`, estErr.message);
          }
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
          } else {
            // Use estimation system as fallback  
            const marketData = await this.buildMarketDataForEstimation(ticker, {}, {});
            const estimated = ShortInterestEstimator.generateMetrics(marketData);
            
            result[ticker] = {
              borrow_fee_pct: estimated.borrow_fee_pct,
              borrow_fee_trend_pp7d: estimated.borrow_fee_trend_pp7d,
              estimated: true
            };
            
            console.log(`💰 Estimated borrow fee for ${ticker}: ${estimated.borrow_fee_pct}%`);
          }
        } catch (e) {
          // Still provide fallback even on error
          try {
            const marketData = await this.buildMarketDataForEstimation(ticker, {}, {});
            const estimated = ShortInterestEstimator.generateMetrics(marketData);
            
            result[ticker] = {
              borrow_fee_pct: estimated.borrow_fee_pct,
              borrow_fee_trend_pp7d: estimated.borrow_fee_trend_pp7d,
              estimated: true
            };
          } catch (estErr) {
            console.warn(`Failed to estimate borrow data for ${ticker}:`, estErr.message);
          }
        }
      })
    );
    
    return result;
  }
};