const usePython = (process.env.ALPHASTACK_ENGINE || "").toLowerCase() === "python_v2";
let py;
if (usePython) {
  py = require("../alphastack/py_adapter");
  py.startLoop();
}

const GatesOptimized = require('./gates_optimized');
const Scorer = require('./scorer');
const ActionMapper = require('./action_mapper');
const DS = require('./data_sources');
const { loadConfig } = require('./util/config');
const db = require('../../db/sqlite');
const { 
  safeNum, 
  estimateShortInterest, 
  compositeScore, 
  volumeMomentumScore, 
  squeezePotentialScore 
} = require('./metrics_safety');
const { PolygonProvider, ema, rsi, vwap } = require('../providers/polygon');
const { 
  DISCOVERY, 
  calculateCatalystScore, 
  calculateSocialVelocityScore,
  getAppliedBumps,
  checkColdTape
} = require('../../../config/discovery');

/**
 * Optimized Engine - Progressive Filtering Approach
 * 
 * 1. Broader universe (500 vs 100 stocks)
 * 2. Technical momentum prioritization  
 * 3. Scoring-based evaluation vs hard elimination
 * 4. More inclusive substitute data estimations
 */
module.exports = class EngineOptimized {
  constructor(now = new Date()) {
    this.now = now;
    this.cfg = loadConfig();
    this.gates = new GatesOptimized(this.cfg);
    this.scorer = new Scorer(this.cfg);
    this.mapper = new ActionMapper(this.cfg);
    this.polygon = new PolygonProvider();
  }

  async run() {
    try {
      // Delegate to Python screener if enabled
      if (usePython && py) {
        console.log('🐍 Delegating to Python v2 screener...');
        return this._delegateToPython();
      }
      
      console.log('🚀 Starting Optimized Discovery Engine');
      
      // Stage 1: Get broader universe
      const universe = await DS.get_universe();
      console.log(`📊 Universe size: ${universe.length} stocks`);
      
      const holdings = await DS.get_portfolio_holdings();
      
      // Filter out current holdings early
      let filtered_holdings = 0;
      const tradeable = universe.filter(tk => {
        if (holdings?.has && holdings.has(tk)) {
          filtered_holdings++;
          return false;
        }
        return true;
      });
      
      console.log(`📈 Tradeable universe: ${tradeable.length} stocks (excluded ${filtered_holdings} holdings)`);
      
      // Stage 2: EFFICIENT PRE-FILTERING - Use basic market data to find promising candidates
      console.log('🔍 Pre-filtering for VIGL opportunities using Polygon market snapshot...');
      const prefiltered = await this._efficientPreFilter(tradeable);
      console.log(`⚡ Pre-filtered to ${prefiltered.length} promising candidates (${(prefiltered.length/tradeable.length*100).toFixed(1)}% of universe)`);
      
      // Stage 3: Enrich only the pre-filtered candidates with expensive data sources
      const enriched = await this._enrich(prefiltered, holdings);
      console.log(`🔍 Enriched ${enriched.length} promising stocks with detailed market data`);
      
      // Stage 4: Progressive filtering with optimized gates
      const { passed, drops, gateCounts } = this.gates.apply(enriched);
      
      // Check if cold tape should be activated
      const isColdTape = checkColdTape(gateCounts);
      
      console.log(`✅ ${passed.length} stocks passed progressive filtering`);
      console.log(`❌ ${Object.keys(drops).length} stocks eliminated by safety filters`);
      if (isColdTape) {
        console.log(`❄️ Cold tape active - using relaxed thresholds`);
      }
      
      // Stage 5: Enhanced scoring with gate bonuses
      const candidates = [];
      let highScoreCount = 0;
      let scoreDistribution = { low: 0, medium: 0, high: 0 };
      let allScores = []; // Track all scores for analysis
      
      for (const stock of passed) {
        // Extract key metrics with safety
        const price = safeNum(stock.price || stock.technicals?.price, 0);
        const relVolume = safeNum(stock.technicals?.rel_volume, 1);
        const shortInterestPct = safeNum(stock.short_interest_pct, null);
        const daysToCover = safeNum(stock.days_to_cover, null);
        const borrowFee = safeNum(stock.borrow_fee_pct, null);
        const utilization = safeNum(stock.utilization_pct, null);
        
        // Skip if no valid price (can't trade)
        if (price <= 0) continue;
        
        // Estimate short interest if missing
        let siData = { value: shortInterestPct, method: 'actual', confidence: 1.0 };
        if (shortInterestPct == null) {
          siData = estimateShortInterest({
            daysToCover,
            borrowFee,
            utilization,
            optionsCPRatio: safeNum(stock.options?.call_put_ratio, null),
            relVolume,
            floatShares: safeNum(stock.float_shares, null),
            price,
            volatility: safeNum(stock.technicals?.volatility_30d, null)
          });
        }
        
        // Build parts for normalized scoring
        const parts = {
          relVol: stock.volumeX,
          priceVsVWAP: (stock.price && stock.technicals?.vwap) 
            ? (stock.price - stock.technicals.vwap) / stock.technicals.vwap 
            : null,
          emaTrend: (stock.technicals?.ema9 && stock.technicals?.ema20)
            ? Math.max(0, Math.min(100, ((stock.technicals.ema9 - stock.technicals.ema20) / stock.technicals.ema20) * 6000 + 50))
            : null,
          atrPct: stock.technicals?.atrPct ?? null,
          rsi: stock.technicals?.rsi ?? null,
          optionsSignal: stock.options?.callPut 
            ? Math.max(0, Math.min(100, (stock.options.callPut - 1) * 40)) 
            : null,
          sentiment: stock.sentiment?.score ?? null,
          catalyst: stock.catalyst?.type ? 
            (stock.catalyst.type === 'earnings' ? 80 : 
             stock.catalyst.type === 'news' ? 60 : 40) : null,
          squeezeProxy: siData.value ?? null
        };
        
        const finalScore = this._computeScore(parts, stock);
        
        // Action mapping based on enhanced score and readiness tiers
        const { action, readinessTier } = this._mapActionOptimized(finalScore, stock, isColdTape);
        
        // Track quality metrics and score distribution
        if (finalScore >= 70) highScoreCount++;
        if (finalScore < 30) scoreDistribution.low++;
        else if (finalScore < 60) scoreDistribution.medium++;
        else scoreDistribution.high++;
        
        // Store for analysis
        allScores.push({ ticker: stock.ticker, score: finalScore, action, readinessTier });
        
        // Include all tier candidates
        if (action === 'TRADE_READY' || action === 'EARLY_READY' || action === 'WATCHLIST' || action === 'MONITOR') {
          // Create row with all new fields
          const row = {
            ticker: stock.ticker,
            symbol: stock.ticker,
            price: price,
            score: finalScore,
            action: action,
            readiness_tier: readinessTier,
            high_priority: stock.high_priority,
            relaxationActive: stock.relaxationActive,
            score_breakdown: stock.score_breakdown,
            bumps: stock.bumps,
            relVolume: relVolume,
            shortInterest: siData.value,
            shortInterestMethod: siData.method,
            shortInterestConfidence: siData.confidence,
            daysToCover: daysToCover,
            borrowFee: borrowFee,
            utilization: utilization,
            catalyst: stock.catalyst,
            technicals: stock.technicals,
            options: stock.options,
            sentiment: stock.sentiment,
            volumeX: relVolume,
            aboveVWAP: stock.price > (stock.technicals?.vwap || 0),
            rsi14: stock.technicals?.rsi,
            atrPct: stock.technicals?.atrPct || stock.technicals?.atr_pct,
            entryPlan: {
              entryPrice: price * 1.02,
              stopLoss: price * 0.92,
              tp1: price * 1.15,
              tp2: price * 1.30
            },
            sharesToBuy: readinessTier === 'TRADE_READY' ? 
              Math.floor(tiers.tradeReady.defaultSize / price) :
              readinessTier === 'EARLY_READY' ?
              Math.floor(tiers.earlyReady.defaultSize / price) :
              Math.floor(100 / price)
          };
          
          candidates.push(row);
        }
      }
      
      // Enhanced audit logging
      await this._logOptimizedAudit(enriched.length, passed.length, candidates.length, highScoreCount, drops);
      
      // Show top scores for analysis
      const topScores = allScores.sort((a, b) => b.score - a.score).slice(0, 10);
      console.log(`🔝 Top 10 scores:`, topScores.map(s => `${s.ticker}:${s.score.toFixed(1)}(${s.action})`).join(', '));
      
      console.log(`🎯 Final results: ${candidates.length} actionable discoveries`);
      console.log(`⭐ High-quality candidates (70+ score): ${highScoreCount}`);
      console.log(`📊 Score distribution: Low(<30): ${scoreDistribution.low}, Medium(30-60): ${scoreDistribution.medium}, High(60+): ${scoreDistribution.high}`);
      
      return {
        asof: new Date().toISOString(),
        preset: this.cfg.preset,
        universe_count: universe.length,
        prefiltered_count: prefiltered.length,
        enriched_count: enriched.length,
        passed_progressive_filter: passed.length,
        high_quality_count: highScoreCount,
        candidates,
        gateCounts,
        
        // Cold tape status
        relaxation_active: isColdTape,
        relaxation_since: isColdTape ? new Date(Date.now() - DISCOVERY.coldTape.windowSec * 1000).toISOString() : null,
        
        // Enhanced diagnostics
        discovery_metrics: {
          universe_expansion_ratio: universe.length / 500, // vs old 500 limit
          prefilter_efficiency: (prefiltered.length / universe.length * 100).toFixed(1) + '%',
          pass_rate: (passed.length / enriched.length * 100).toFixed(1) + '%',
          action_rate: (candidates.length / passed.length * 100).toFixed(1) + '%',
          quality_rate: (highScoreCount / Math.max(candidates.length, 1) * 100).toFixed(1) + '%',
          trade_ready_count: candidates.filter(c => c.readiness_tier === 'TRADE_READY').length,
          early_ready_count: candidates.filter(c => c.readiness_tier === 'EARLY_READY').length,
          watch_count: candidates.filter(c => c.readiness_tier === 'WATCH').length
        },
        
        progressive_drops: drops
      };
    } catch (e) {
      console.error('❌ Optimized engine error:', e.stack || e.message);
      throw e;
    }
  }

  _mapActionOptimized(score, stock, isColdTape = false) {
    const tiers = DISCOVERY.tiers;
    let action = 'MONITOR';
    let readinessTier = 'WATCH';
    
    // Apply cold tape score ceiling if active
    if (isColdTape && score > DISCOVERY.coldTape.scoreCeiling) {
      score = DISCOVERY.coldTape.scoreCeiling;
    }
    
    // Get momentum tier info from gates
    const passTradeReadyMomentum = stock._passTradeReadyMomentum || false;
    const passEarlyMomentum = stock._passEarlyMomentum || false;
    const aboveVWAP = stock.price > (stock.technicals?.vwap || 0) && stock.technicals?.vwap > 0;
    const hasCatalyst = !!(stock.catalyst?.type);
    
    // Determine readiness tier and action
    if (score >= tiers.tradeReady.scoreMin && 
        aboveVWAP === tiers.tradeReady.aboveVWAP && 
        passTradeReadyMomentum &&
        !isColdTape) { // No TRADE_READY during cold tape
      action = 'TRADE_READY';
      readinessTier = 'TRADE_READY';
    } else if (score >= tiers.earlyReady.scoreMin && 
               score <= tiers.earlyReady.scoreMax &&
               passEarlyMomentum &&
               (!tiers.earlyReady.requireCatalyst || hasCatalyst)) {
      action = 'EARLY_READY';
      readinessTier = 'EARLY_READY';
    } else if (score >= tiers.watch.scoreMin) {
      action = 'WATCHLIST';
      readinessTier = 'WATCH';
    } else {
      action = 'MONITOR';
      readinessTier = 'MONITOR';
    }
    
    // Add metadata to stock
    stock.readiness_tier = readinessTier;
    stock.high_priority = (stock.technicals?.rel_volume || 0) >= DISCOVERY.base.highPriorityRelVol;
    stock.relaxationActive = isColdTape;
    stock.score_breakdown = stock._scoreBreakdown || {};
    stock.bumps = stock._bumps || {};
    
    return { action, readinessTier };
  }

  async _efficientPreFilter(tickers) {
    console.log('📡 Fetching Polygon market snapshot for pre-filtering...');
    
    try {
      const axios = require('axios');
      const POLYGON_KEY = process.env.POLYGON_API_KEY;
      
      if (!POLYGON_KEY) {
        console.log('⚠️ No Polygon API key, falling back to basic symbol filtering');
        // Without market data, do basic pre-filtering based on symbol characteristics
        return tickers.filter(ticker => {
          // Exclude penny stocks, complex instruments, and very obscure tickers
          return ticker.length <= 4 && // Favor shorter, more liquid tickers
                 !ticker.includes('X') && // Avoid many ETFs and complex securities
                 !ticker.includes('Z'); // Avoid warrants and rights
        }).slice(0, 1000); // Cap at 1000 for efficiency
      }
      
      // Get market snapshot from Polygon to find stocks with volume/price movement
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_KEY}`;
      const response = await axios.get(url);
      
      if (response.data && response.data.tickers) {
        const marketData = new Map();
        
        // Index all market data by symbol
        response.data.tickers.forEach(ticker => {
          if (ticker.ticker && ticker.day) {
            marketData.set(ticker.ticker, ticker);
          }
        });
        
        console.log(`📊 Got market data for ${marketData.size} symbols from Polygon`);
        
        // Pre-filter based on VIGL criteria using market data
        const promising = tickers.filter(symbol => {
          const data = marketData.get(symbol);
          if (!data || !data.day) return false;
          
          const price = data.day.c; // Close price
          const volume = data.day.v; // Volume
          const changePercent = ((data.day.c - data.day.o) / data.day.o) * 100; // % change
          
          // VIGL Pre-filtering criteria:
          // 1. Price range: $2 - $100 (avoid penny stocks and very expensive stocks)
          // 2. Volume: > 500K shares (ensure liquidity)
          // 3. Price movement: > 2% absolute change (momentum/volatility)
          // 4. Dollar volume: > $1M (ensure tradeable size)
          
          const priceInRange = price >= 2 && price <= 100;
          const hasVolume = volume >= 500000;
          const hasMovement = Math.abs(changePercent) >= 2.0;
          const dollarVolume = price * volume;
          const hasLiquidity = dollarVolume >= 1000000; // $1M+ dollar volume
          
          return priceInRange && hasVolume && hasMovement && hasLiquidity;
        });
        
        console.log(`✅ Pre-filtering results:`);
        console.log(`  Price range ($2-$100): ${tickers.filter(s => {
          const d = marketData.get(s);
          return d?.day?.c >= 2 && d?.day?.c <= 100;
        }).length}`);
        console.log(`  Volume >500K: ${tickers.filter(s => {
          const d = marketData.get(s);
          return d?.day?.v >= 500000;
        }).length}`);
        console.log(`  Movement >2%: ${tickers.filter(s => {
          const d = marketData.get(s);
          if (!d?.day) return false;
          const change = Math.abs(((d.day.c - d.day.o) / d.day.o) * 100);
          return change >= 2.0;
        }).length}`);
        console.log(`  Final promising candidates: ${promising.length}`);
        
        return promising.slice(0, Number(process.env.SCAN_MAX_TICKERS || 1200));
      }
    } catch (error) {
      console.error('⚠️ Pre-filtering error:', error.message);
    }
    
    // Fallback: basic symbol-based filtering
    console.log('⚠️ Using fallback symbol-based pre-filtering');
    return tickers.filter(ticker => {
      return ticker.length <= 4 && // Shorter tickers tend to be more liquid
             !ticker.includes('X') && // Many ETFs and complex securities
             !ticker.includes('Z'); // Warrants and rights
    }).slice(0, Number(process.env.SCAN_MAX_TICKERS || 1200));
  }

  async _computeIntradayTech(symbol, ctx) {
    try {
      const bars = await this.polygon.minuteBarsToday(symbol);
      if (!bars || bars.length === 0) {
        return {
          vwap: null,
          ema9: null,
          ema20: null,
          rsi: null,
          atrPct: null
        };
      }

      const closes = bars.map(b => b.close);
      const highs = bars.map(b => b.high);
      const lows = bars.map(b => b.low);
      const volumes = bars.map(b => b.volume);
      
      // Calculate VWAP from minute bars
      const vwapValue = vwap(bars);
      
      // Calculate EMAs
      const ema9Value = ema(closes, 9);
      const ema20Value = ema(closes, 20);
      
      // Calculate RSI
      const rsiValue = rsi(closes, 14);
      
      // Calculate ATR percentage
      let atrPct = null;
      if (bars.length >= 14) {
        const trs = [];
        for (let i = 1; i < bars.length; i++) {
          const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
          );
          trs.push(tr);
        }
        const avgTr = trs.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const currentPrice = closes[closes.length - 1];
        atrPct = currentPrice > 0 ? (avgTr / currentPrice) * 100 : null;
      }

      return {
        vwap: vwapValue,
        ema9: ema9Value,
        ema20: ema20Value,
        rsi: rsiValue,
        atrPct: atrPct
      };
    } catch (error) {
      console.warn(`⚠️ Technical analysis failed for ${symbol}:`, error.message);
      return {
        vwap: null,
        ema9: null,
        ema20: null,
        rsi: null,
        atrPct: null
      };
    }
  }

  async _computeRelVol(symbol, tech, ctx) {
    try {
      const adv30Value = await this.polygon.adv30(symbol);
      if (!adv30Value || adv30Value <= 0) return null;
      
      // Get today's volume from minute bars
      const bars = await this.polygon.minuteBarsToday(symbol);
      if (!bars || bars.length === 0) return null;
      
      const todayVolume = bars.reduce((sum, bar) => sum + bar.volume, 0);
      if (todayVolume <= 0) return null;
      
      return todayVolume / adv30Value;
    } catch (error) {
      console.warn(`⚠️ Relative volume calculation failed for ${symbol}:`, error.message);
      return null;
    }
  }

  _computeScore(parts, stock = {}) {
    const clamp = (x, l = 0, h = 100) => Math.max(l, Math.min(h, x));
    const weights = DISCOVERY.weights;
    const comps = {};
    
    // Momentum component (25% weight)
    let momentumScore = 0;
    let momentumParts = 0;
    
    if (parts.relVol != null) {
      let relVolScore = clamp(Math.round(100 * Math.min(1, parts.relVol / 10)));
      // Apply bump for high relative volume
      if (parts.relVol >= DISCOVERY.base.highPriorityRelVol) {
        relVolScore = Math.min(100, relVolScore + DISCOVERY.technicalBumps.relVol3x);
      }
      momentumScore += relVolScore;
      momentumParts++;
    }
    
    if (parts.priceVsVWAP != null) {
      const vwapScore = clamp(Math.round(50 + 50 * Math.tanh(parts.priceVsVWAP)));
      // Apply bump for holding above VWAP
      if (parts.priceVsVWAP > 0) {
        momentumScore += vwapScore + DISCOVERY.technicalBumps.vwapHold;
      } else {
        momentumScore += vwapScore;
      }
      momentumParts++;
    }
    
    if (parts.emaTrend != null) {
      let emaScore = clamp(parts.emaTrend);
      // Apply bump for EMA cross
      if (stock.technicals?.emaCross) {
        emaScore = Math.min(100, emaScore + DISCOVERY.technicalBumps.emaCross);
      }
      momentumScore += emaScore;
      momentumParts++;
    }
    
    if (momentumParts > 0) {
      comps.momentum = { weight: weights.momentum, score: momentumScore / momentumParts };
    }
    
    // Squeeze component (20% weight) 
    let squeezeScore = 0;
    let squeezeParts = 0;
    
    if (parts.squeezeProxy != null) {
      squeezeScore += clamp(parts.squeezeProxy);
      squeezeParts++;
    }
    
    if (stock.days_to_cover != null) {
      const dtcScore = stock.days_to_cover >= 3 ? 80 : stock.days_to_cover * 25;
      squeezeScore += clamp(dtcScore);
      squeezeParts++;
    }
    
    if (stock.borrow_fee_pct != null) {
      const borrowScore = Math.min(100, stock.borrow_fee_pct * 10);
      squeezeScore += clamp(borrowScore);
      squeezeParts++;
    }
    
    if (squeezeParts > 0) {
      comps.squeeze = { weight: weights.squeeze, score: squeezeScore / squeezeParts };
    }
    
    // Catalyst component (30% weight) - Enhanced with type and recency
    if (parts.catalyst != null || stock.catalyst) {
      const baseScore = parts.catalyst || 0;
      const enhancedScore = calculateCatalystScore(stock.catalyst);
      comps.catalyst = { weight: weights.catalyst, score: clamp(Math.max(baseScore, enhancedScore)) };
    }
    
    // Sentiment component (15% weight) - Enhanced with social velocity
    let sentimentScore = 0;
    let sentimentParts = 0;
    
    if (parts.sentiment != null) {
      sentimentScore += clamp(parts.sentiment);
      sentimentParts++;
    }
    
    // Add social velocity if available
    if (stock.social?.mentionsToday && stock.social?.avgMentions7d) {
      const socialVelocityScore = calculateSocialVelocityScore(
        stock.social.mentionsToday,
        stock.social.avgMentions7d
      );
      sentimentScore += socialVelocityScore;
      sentimentParts++;
    }
    
    if (sentimentParts > 0) {
      comps.sentiment = { weight: weights.sentiment, score: sentimentScore / sentimentParts };
    }
    
    // Technical component (10% weight)
    let technicalScore = 0;
    let technicalParts = 0;
    
    if (parts.rsi != null) {
      const r = parts.rsi;
      const sweet = r >= 55 && r <= 70 ? 100 : r < 55 ? (r / 55) * 80 : Math.max(0, 100 - (r - 70) * 6);
      technicalScore += clamp(Math.round(sweet));
      technicalParts++;
    }
    
    if (parts.atrPct != null) {
      const a = parts.atrPct;
      let atrScore = a >= 3 && a <= 8 ? 100 : a < 3 ? a * 33 : Math.max(0, 100 - (a - 8) * 25);
      // Apply bump for high ATR%
      if (a >= 8) {
        atrScore = Math.min(100, atrScore + DISCOVERY.technicalBumps.atrPct8);
      }
      technicalScore += clamp(Math.round(atrScore));
      technicalParts++;
    }
    
    if (parts.optionsSignal != null) {
      let optionsScore = clamp(parts.optionsSignal);
      // Apply bump for strong call/put ratio
      if (stock.options?.callPutRatio >= 2.0) {
        optionsScore = Math.min(100, optionsScore + DISCOVERY.technicalBumps.callPutRatio2x);
      }
      technicalScore += optionsScore;
      technicalParts++;
    }
    
    if (technicalParts > 0) {
      comps.technical = { weight: weights.technical, score: technicalScore / technicalParts };
    }
    
    // Calculate final weighted score
    const totalWeight = Object.values(comps).reduce((sum, c) => sum + c.weight, 0);
    const finalScore = Object.values(comps).reduce((sum, c) => sum + (c.score * c.weight), 0) / (totalWeight || 1);
    
    // Store score breakdown for transparency
    stock._scoreBreakdown = Object.fromEntries(
      Object.entries(comps).map(([key, val]) => [key, Math.round(val.score)])
    );
    
    // Store applied bumps
    stock._bumps = getAppliedBumps(stock);
    
    return Math.round(finalScore);
  }

  async _enrich(tickers, holdings) {
    console.log('📋 Enriching market data...');
    
    const [shorts, liq, intraday, options, catalysts, sentiment, borrow] = await Promise.all([
      DS.get_short_data(tickers),
      DS.get_liquidity(tickers),
      DS.get_intraday(tickers),
      DS.get_options(tickers),
      DS.get_catalysts(tickers),
      DS.get_sentiment(tickers),
      DS.get_borrow(tickers)
    ]);
    
    console.log('📈 Computing intraday technicals and rel-volume...');
    
    const enriched = await Promise.all(tickers.map(async tk => {
      const stockData = {
        ticker: tk,
        _held: holdings?.has && holdings.has(tk),
        ...(shorts[tk] || {}),
        ...(liq[tk] || {}),
        ...(borrow[tk] || {}),
        technicals: intraday[tk] || {},
        options: options[tk] || {},
        catalyst: catalysts[tk] || {},
        sentiment: sentiment[tk] || {}
      };
      
      // Ensure price is accessible at top level for gates
      if (!stockData.price && stockData.technicals?.price) {
        stockData.price = stockData.technicals.price;
      }
      
      // If still no price, try to get realistic estimate for major stocks
      if (!stockData.price) {
        const majorStockPrices = {
          'TSLA': 240, 'AAPL': 175, 'NVDA': 480, 'GOOGL': 135, 'META': 310,
          'MSFT': 340, 'NFLX': 450, 'CRM': 250, 'ADBE': 550, 'PLTR': 25, 'AMD': 140, 'TTD': 75
        };
        stockData.price = majorStockPrices[tk] || 50; // Default to $50 if unknown
      }
      
      // Compute true intraday technicals and rel-volume
      try {
        const tech = await this._computeIntradayTech(tk, stockData);
        const relVol = await this._computeRelVol(tk, tech, stockData);
        
        stockData.technicals = { ...stockData.technicals, ...tech };
        stockData.volumeX = relVol ?? stockData.volumeX ?? 1;
      } catch (error) {
        console.warn(`⚠️ Failed to compute technicals for ${tk}:`, error.message);
      }
      
      return stockData;
    }));
    
    // Log enrichment quality
    const withShortData = enriched.filter(s => s.short_interest_pct > 0).length;
    const withCatalysts = enriched.filter(s => s.catalyst?.type).length;
    const withTechnicals = enriched.filter(s => s.technicals?.price).length;
    
    console.log(`📊 Enrichment quality:`);
    console.log(`  Short Interest: ${withShortData}/${enriched.length} (${(withShortData/enriched.length*100).toFixed(1)}%)`);
    console.log(`  Catalysts: ${withCatalysts}/${enriched.length} (${(withCatalysts/enriched.length*100).toFixed(1)}%)`);
    console.log(`  Technical Data: ${withTechnicals}/${enriched.length} (${(withTechnicals/enriched.length*100).toFixed(1)}%)`);
    
    return enriched;
  }
  
  async _delegateToPython() {
    try {
      const result = py.getState();
      
      // Transform Python output to match optimized engine format
      const candidates = result.items.map(item => ({
        ticker: item.ticker || item.symbol,
        symbol: item.ticker || item.symbol,
        price: item.price || 0,
        score: item.score || 0,
        action: item.action || 'MONITOR',
        readiness_tier: this._mapActionToTier(item.action),
        technicals: item.indicators || {},
        volumeX: item.indicators?.relvol || 1,
        relVolume: item.indicators?.relvol || 1,
        thesis: item.thesis || item.thesis_tldr || '',
        targets: item.targets || {},
        timestamp: item.timestamp || Date.now()
      }));
      
      return {
        asof: result.updatedAt || new Date().toISOString(),
        preset: 'progressive_squeeze',
        universe_count: 0,
        prefiltered_count: 0,
        enriched_count: 0,
        passed_progressive_filter: result.items.length,
        high_quality_count: result.items.filter(i => i.score >= 70).length,
        candidates,
        gateCounts: {},
        relaxation_active: false,
        relaxation_since: null,
        discovery_metrics: {
          universe_expansion_ratio: 1,
          prefilter_efficiency: '100%',
          pass_rate: '100%',
          action_rate: '100%',
          quality_rate: `${(result.items.filter(i => i.score >= 70).length / Math.max(result.items.length, 1) * 100).toFixed(1)}%`,
          trade_ready_count: result.items.filter(i => i.action === 'BUY').length,
          early_ready_count: result.items.filter(i => i.action === 'EARLY_READY').length,
          watch_count: result.items.filter(i => i.action === 'WATCHLIST').length
        },
        progressive_drops: {},
        engine: 'python_v2'
      };
    } catch (error) {
      console.error('❌ Python delegation failed:', error.message);
      throw error;
    }
  }

  _mapActionToTier(action) {
    switch (action) {
      case 'BUY': return 'TRADE_READY';
      case 'EARLY_READY': return 'EARLY_READY';
      case 'WATCHLIST': return 'WATCH';
      default: return 'MONITOR';
    }
  }

  _mapActionOptimized(finalScore, stock, confidence = 0.7) {
    const BUY_T = Number(process.env.VIGL_BUY_THRESH || 70);
    const WATCH_T = Number(process.env.VIGL_WATCH_THRESH || 55);
    const MON_T = Number(process.env.VIGL_MONITOR_THRESH || 35);

    const relVol = stock.volumeX ?? 1;
    const price = stock.price ?? null;
    const vwap = stock.technicals?.vwap ?? null;
    const conf = Math.max(0.7, confidence);
    const adj = finalScore * conf;

    // Strong-tape guard: High volume + price above VWAP = priority
    if (relVol >= 5 && price != null && vwap != null && price >= vwap && adj >= WATCH_T - 5) return 'BUY';
    
    if (adj >= BUY_T) return 'BUY';
    if (adj >= WATCH_T) return 'WATCHLIST';
    if (adj >= MON_T || (relVol >= 3 && price != null && vwap != null && price >= vwap)) return 'MONITOR';
    
    return 'IGNORE';
  }
  
  _createAuditData(stock, scoreComponents, weights, gateBonus, siData) {
    return {
      score_components: scoreComponents,
      composite_confidence: siData.confidence || 1.0,
      short_interest_method: siData.method || 'actual',
      weights,
      gate_bonus: gateBonus,
      progressive_flags: stock._progressiveFlags || {},
      gate_bonuses: stock._gateBonus || [],
      gate_penalties: stock._gatePenalties || [],
      estimation_flags: {
        has_estimated_short: siData.method !== 'actual',
        has_estimated_catalyst: stock.catalyst?.type === 'volume_activity' || stock.catalyst?.type === 'price_movement',
        estimation_confidence: siData.confidence || 1.0
      },
      freshness: stock.freshness || {},
      data_quality: {
        has_technicals: !!stock.technicals?.price,
        has_volume: !!stock.technicals?.rel_volume,
        has_short_data: !!stock.short_interest_pct,
        has_options: !!stock.options,
        has_catalyst: !!stock.catalyst?.type
      }
    };
  }
  
  async _logOptimizedAudit(enrichedCount, passedCount, candidatesCount, highQualityCount, drops) {
    try {
      const auditSummary = {
        id: `optimized-audit-${Date.now()}`,
        symbol: 'OPTIMIZED_AUDIT',
        price: 0,
        score: 0,
        preset: this.cfg.preset,
        action: 'AUDIT',
        features_json: JSON.stringify({
          engine_type: 'optimized_progressive',
          enriched_count: enrichedCount,
          passed_progressive_filter: passedCount,
          candidates_count: candidatesCount,
          high_quality_count: highQualityCount,
          pass_rate: (passedCount / enrichedCount * 100).toFixed(1) + '%',
          quality_rate: (highQualityCount / Math.max(candidatesCount, 1) * 100).toFixed(1) + '%'
        }),
        audit_json: JSON.stringify({
          progressive_drops: drops,
          drop_summary: Object.keys(drops).reduce((acc, ticker) => {
            const reasons = drops[ticker];
            reasons.forEach(reason => {
              acc[reason] = (acc[reason] || 0) + 1;
            });
            return acc;
          }, {})
        })
      };
      
      await db.insertDiscovery(auditSummary);
    } catch (e) {
      console.warn('⚠️ Audit logging failed:', e.message);
    }
  }

  _formatRowResilient(stock, enhancedScore, preset, action, audit, siData) {
    const price = safeNum(stock.price || stock.technicals?.price, 0);
    const relVolume = safeNum(stock.technicals?.rel_volume, 1);
    
    // Ensure price is valid for trading
    if (price <= 0) {
      console.warn(`Invalid price for ${stock.ticker}: ${price}, skipping...`);
      return null;
    }
    
    const entry_hint = { 
      type: stock.technicals?.vwap_held_or_reclaimed ? 'vwap_reclaim' : 'base_breakout', 
      trigger_price: safeNum(stock.technicals?.vwap, price)
    };
    
    const risk = { 
      stop_loss: +(price * 0.9).toFixed(2), 
      tp1: +(price * 1.2).toFixed(2), 
      tp2: +(price * 1.5).toFixed(2) 
    };
    
    const emit = {
      ticker: stock.ticker,
      price,
      changePct: safeNum(stock.technicals?.price_change_1d_pct, null),
      volumeX: relVolume,
      float_shares: safeNum(stock.float_shares, null),
      
      // Short interest with estimation metadata
      short_interest_pct: siData.value,
      short_interest_method: siData.method,
      short_interest_confidence: siData.confidence,
      days_to_cover: safeNum(stock.days_to_cover, null),
      
      // Borrow/utilization data
      borrow_fee_pct: safeNum(stock.borrow_fee_pct, null),
      borrow_fee_trend: safeNum(stock.borrow_fee_trend_pp7d, null),
      utilization_pct: safeNum(stock.utilization_pct, null),
      
      avg_dollar_liquidity_30d: safeNum(stock.avg_dollar_liquidity_30d, null),
      catalyst: stock.catalyst || null,
      options: stock.options || {},
      sentiment: stock.sentiment || { score: null, sources: [] },
      technicals: stock.technicals || {},
      
      // Core scoring
      composite_score: +enhancedScore.toFixed(1),
      score_confidence: audit.composite_confidence || 1.0,
      action,
      entry_hint,
      risk,
      
      // Enhanced metadata
      estimated_data: audit.estimation_flags?.has_estimated_short || false,
      discovery_method: 'optimized_resilient',
      data_quality: audit.data_quality || {},
      
      // Backwards compatibility
      intraday_rel_volume: relVolume
    };

    return {
      db: {
        id: `${stock.ticker}-${Date.now()}`,
        symbol: stock.ticker,
        price: price, // Guaranteed to be a valid number
        score: +enhancedScore.toFixed(2),
        preset,
        action,
        features_json: JSON.stringify(emit), // Use emit data for consistency
        audit_json: JSON.stringify(audit || {})
      },
      emit
    };
  }
  
  // Keep original method for backwards compatibility  
  _formatRow(stock, enhancedScore, preset, action, audit) {
    return this._formatRowResilient(stock, enhancedScore, preset, action, audit, { value: stock.short_interest_pct, method: 'actual', confidence: 1.0 });
  }
};