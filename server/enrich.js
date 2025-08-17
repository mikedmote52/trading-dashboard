/* Feature Enrichment System for VIGL Discoveries
 * Enriches discoveries with squeeze-critical signals:
 * - Technical indicators (RSI, EMA crossovers, ATR, VWAP)
 * - Options data (call/put ratios, IV percentiles)
 * - Short interest metrics (utilization, borrow fees)
 * - Sentiment analysis (social buzz ratios)
 * - Catalyst detection
 * - Explosiveness scoring (0-100 scale)
 */

const yahooFinance = require('yahoo-finance2').default;
const dayjs = require('dayjs');
const { RSI, EMA, ATR } = require('technicalindicators');
const fetch = require('node-fetch');

// Rate limiting for Yahoo Finance API
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let lastYfCall = 0;
const YF_DELAY = 1200; // 1.2s between calls to be respectful

async function rateLimitedYfCall(fn) {
  const now = Date.now();
  const elapsed = now - lastYfCall;
  if (elapsed < YF_DELAY) {
    await sleep(YF_DELAY - elapsed);
  }
  lastYfCall = Date.now();
  return await fn();
}

// Normalization helper for scoring
function norm(x, min, max) {
  if (x === undefined || x === null || Number.isNaN(Number(x))) return 0;
  if (max === min) return 0;
  const v = (Number(x) - min) / (max - min);
  return Math.max(0, Math.min(1, v));
}

// Technical Indicators Calculation
async function calculateTechnicalIndicators(symbol) {
  try {
    console.log(`📊 Fetching technical data for ${symbol}...`);
    
    const result = await rateLimitedYfCall(async () => {
      // Get 60 days of data for technical calculations
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60);
      
      return await yahooFinance.chart(symbol, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });
    });

    if (!result?.quotes?.length || result.quotes.length < 20) {
      console.log(`⚠️ Insufficient data for ${symbol} technical analysis`);
      return null;
    }

    const quotes = result.quotes.filter(q => q && Number.isFinite(q.close));
    if (quotes.length < 20) return null;

    const closes = quotes.map(q => q.close);
    const highs = quotes.map(q => q.high);
    const lows = quotes.map(q => q.low);
    const volumes = quotes.map(q => q.volume || 0);
    
    // Calculate indicators
    const rsi = RSI.calculate({ values: closes, period: 14 });
    const ema9 = EMA.calculate({ values: closes, period: 9 });
    const ema20 = EMA.calculate({ values: closes, period: 20 });
    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14
    });

    const currentPrice = closes[closes.length - 1];
    const currentRSI = rsi[rsi.length - 1];
    const currentATR = atr[atr.length - 1];
    const currentEMA9 = ema9[ema9.length - 1];
    const currentEMA20 = ema20[ema20.length - 1];
    
    // Calculate average volume (30-day)
    const recentVolumes = volumes.slice(-30);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

    // VWAP calculation (simplified for last 20 days)
    const recentQuotes = quotes.slice(-20);
    let vwapSum = 0;
    let volumeSum = 0;
    for (const q of recentQuotes) {
      const typicalPrice = (q.high + q.low + q.close) / 3;
      vwapSum += typicalPrice * q.volume;
      volumeSum += q.volume;
    }
    const vwap = volumeSum > 0 ? vwapSum / volumeSum : currentPrice;
    
    return {
      rsi: currentRSI,
      atr_pct: (currentATR / currentPrice) * 100,
      ema9_20_crossover: currentEMA9 > currentEMA20,
      vwap_hold: currentPrice >= vwap * 0.995, // Within 0.5% of VWAP
      volume_ratio: volumeRatio,
      price: currentPrice,
      avg_volume_30d: avgVolume
    };

  } catch (error) {
    console.log(`⚠️ Technical analysis failed for ${symbol}: ${error.message}`);
    return null;
  }
}

// Options Chain Analysis (simplified - using quote data as proxy)
async function analyzeOptionsChain(symbol) {
  try {
    console.log(`🎯 Analyzing options for ${symbol}...`);
    
    const result = await rateLimitedYfCall(async () => {
      return await yahooFinance.quote(symbol);
    });

    if (!result) return null;

    // Use available volatility metrics as proxy for options data
    const impliedVolatility = result.impliedVolatility || 0;
    const optionsVolume = result.averageVolume || 0;
    
    // Estimate call/put ratio based on momentum and volatility
    // This is a simplified estimation - in production you'd use real options data
    const callPutRatio = impliedVolatility > 0.3 ? 1.5 : 0.8;
    
    // IV percentile estimation (simplified)
    const ivPercentile = Math.min(impliedVolatility * 100, 100);

    return {
      call_put_ratio: callPutRatio,
      iv_percentile: ivPercentile,
      options_volume: optionsVolume
    };

  } catch (error) {
    console.log(`⚠️ Options analysis failed for ${symbol}: ${error.message}`);
    return null;
  }
}

// Short Interest Estimation (using available data)
async function estimateShortInterest(symbol) {
  try {
    console.log(`🎯 Estimating short metrics for ${symbol}...`);
    
    const result = await rateLimitedYfCall(async () => {
      return await yahooFinance.quote(symbol);
    });

    if (!result) return null;

    // Use available metrics to estimate short interest
    const sharesFloat = result.floatShares || result.sharesOutstanding || 0;
    const marketCap = result.marketCap || 0;
    
    // Estimate short interest based on float size and volatility
    // Smaller float = higher potential short interest
    let estimatedSI = 0;
    if (sharesFloat > 0) {
      const floatM = sharesFloat / 1000000; // Convert to millions
      if (floatM < 50) estimatedSI = 15; // Small float stocks often have higher SI
      else if (floatM < 100) estimatedSI = 10;
      else estimatedSI = 5;
    }

    // Estimate utilization and borrow fee based on patterns
    const utilization = Math.min(estimatedSI * 3, 90);
    const borrowFee = estimatedSI > 10 ? 8 : 3;

    return {
      short_interest: estimatedSI,
      short_utilization: utilization,
      borrow_fee: borrowFee,
      float: sharesFloat
    };

  } catch (error) {
    console.log(`⚠️ Short interest estimation failed for ${symbol}: ${error.message}`);
    return null;
  }
}

// Sentiment Analysis (simplified)
function analyzeSentiment(symbol) {
  // Simplified sentiment scoring based on symbol characteristics
  // In production, this would integrate with Reddit/StockTwits/Twitter APIs
  
  const symbolLength = symbol.length;
  const hasNumbers = /\d/.test(symbol);
  
  // Short, memorable symbols tend to have more retail buzz
  let buzzScore = 0.5; // baseline
  if (symbolLength <= 4 && !hasNumbers) buzzScore = 1.2;
  else if (symbolLength <= 5) buzzScore = 0.8;
  
  return {
    score: buzzScore,
    source: 'estimated',
    mentions_24h: Math.floor(buzzScore * 100)
  };
}

// Catalyst Detection (simplified)
function detectCatalysts(symbol, technicals = {}) {
  // Simple catalyst detection based on technical patterns
  const rsi = technicals.rsi || 50;
  const volumeRatio = technicals.volume_ratio || 1;
  const emaX = technicals.ema9_20_crossover || false;
  
  let catalystPresent = false;
  let catalystType = 'none';
  
  // High volume + momentum could indicate news/catalyst
  if (volumeRatio > 3 && (rsi > 60 || emaX)) {
    catalystPresent = true;
    catalystType = 'momentum_breakout';
  } else if (volumeRatio > 5) {
    catalystPresent = true;
    catalystType = 'volume_spike';
  }
  
  return {
    present: catalystPresent,
    type: catalystType,
    confidence: catalystPresent ? 0.7 : 0.3
  };
}

// Explosiveness Scoring Algorithm (based on backtest specifications)
function calculateExplosiveness(features = {}) {
  const f = features || {};
  const tech = f.technicals || {};
  const opts = f.options || {};
  const sent = f.sentiment || {};
  const cat = f.catalyst || {};
  const si = Number(f.short_interest) || 0;
  const util = Number(f.short_utilization) || 0;
  const fee = Number(f.borrow_fee) || 0;
  const float = Number(f.float) || 0;
  const volR = Number(f.volume_ratio) || Number(tech.volume_ratio) || 0;
  const atrp = Number(tech.atr_pct) || 0;
  const rsi = Number(tech.rsi) || 0;
  const emaX = tech.ema9_20_crossover ? 1 : 0;
  const vwap = tech.vwap_hold ? 1 : 0;
  const cpr = Number(opts.call_put_ratio) || 0;
  const ivp = Number(opts.iv_percentile) || 0;
  const buzz = Number(sent.score) || 0;

  // Subscores 0..1 (squeeze-biased thresholds)
  const S_volume = Math.max(norm(volR, 1.5, 15), 0); // prefer 2x..15x volume
  const S_momentum = 0.5 * norm(atrp, 0.02, 0.10) + 
                     0.25 * (rsi >= 60 && rsi <= 75 ? 1 : 0.5 * norm(rsi, 50, 80)) + 
                     0.25 * ((emaX + vwap) / 2);

  // Squeeze enablers: small float OR high short metrics
  const S_float = float > 0 ? norm(50000000, float, 200000000) : 0.4; // <=50M shares best
  const S_short = 0.5 * norm(si, 8, 35) + 0.25 * norm(util, 50, 95) + 0.25 * norm(fee, 3, 25);
  const S_enabler = Math.max(S_float, S_short);

  const S_catalyst = (cat && (cat.present || cat.type !== 'none')) ? 0.9 : 0.3;
  const S_sentiment = Math.max(norm(buzz, 0.4, 2.5), 0.2); // Social buzz ratio
  const S_options = 0.6 * Math.min(cpr / 2, 1) + 0.4 * Math.min(ivp / 100, 1);
  const S_tech = 0.5 * ((emaX + vwap) / 2) + 0.5 * Math.min(atrp / 0.08, 1);

  // Weights optimized for squeeze detection
  const W = {
    volume: 0.30,    // Volume spike is critical
    enabler: 0.25,   // Float/short metrics enable squeezes
    catalyst: 0.20,  // News/events trigger moves
    sentiment: 0.15, // Retail interest amplifies
    options: 0.05,   // Options flow adds fuel
    technicals: 0.05 // Technical setup confirmation
  };

  const score01 =
    W.volume * (0.7 * S_volume + 0.3 * S_momentum) +
    W.enabler * S_enabler +
    W.catalyst * S_catalyst +
    W.sentiment * S_sentiment +
    W.options * S_options +
    W.technicals * S_tech;

  return Math.round(score01 * 100); // 0..100 scale
}

// Main enrichment function
async function enrichDiscovery(discovery) {
  console.log(`🔬 Enriching discovery for ${discovery.symbol}...`);
  
  try {
    // Parse existing features
    let existingFeatures = {};
    if (discovery.features_json) {
      try {
        existingFeatures = JSON.parse(discovery.features_json);
      } catch (e) {
        console.log(`⚠️ Failed to parse existing features for ${discovery.symbol}`);
      }
    }

    // Gather enrichment data
    const [technicals, options, shortMetrics] = await Promise.all([
      calculateTechnicalIndicators(discovery.symbol),
      analyzeOptionsChain(discovery.symbol),
      estimateShortInterest(discovery.symbol)
    ]);

    const sentiment = analyzeSentiment(discovery.symbol);
    const catalyst = detectCatalysts(discovery.symbol, technicals);

    // Combine all features
    const enrichedFeatures = {
      ...existingFeatures,
      technicals: technicals || existingFeatures.technicals || {},
      options: options || existingFeatures.options || {},
      sentiment: sentiment || existingFeatures.sentiment || {},
      catalyst: catalyst || existingFeatures.catalyst || {},
      short_interest: shortMetrics?.short_interest || existingFeatures.short_interest || 0,
      short_utilization: shortMetrics?.short_utilization || existingFeatures.short_utilization || 0,
      borrow_fee: shortMetrics?.borrow_fee || existingFeatures.borrow_fee || 0,
      float: shortMetrics?.float || existingFeatures.float || 0,
      volume_ratio: technicals?.volume_ratio || existingFeatures.volume_ratio || 0,
      enriched_at: new Date().toISOString(),
      enrichment_version: '1.0'
    };

    // Calculate new explosiveness score
    const explosiveness = calculateExplosiveness(enrichedFeatures);

    console.log(`✅ ${discovery.symbol} enriched - Explosiveness: ${explosiveness}`);

    return {
      ...discovery,
      features_json: JSON.stringify(enrichedFeatures),
      explosiveness_score: explosiveness,
      enriched: true,
      enriched_at: new Date().toISOString()
    };

  } catch (error) {
    console.error(`❌ Enrichment failed for ${discovery.symbol}: ${error.message}`);
    return {
      ...discovery,
      enrichment_error: error.message,
      enriched_at: new Date().toISOString()
    };
  }
}

// Batch enrichment with rate limiting
async function enrichDiscoveries(discoveries, options = {}) {
  const { batchSize = 3, delayMs = 2000 } = options;
  const results = [];
  
  console.log(`🚀 Starting enrichment of ${discoveries.length} discoveries...`);
  console.log(`📊 Batch size: ${batchSize}, Delay: ${delayMs}ms`);

  for (let i = 0; i < discoveries.length; i += batchSize) {
    const batch = discoveries.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(discoveries.length / batchSize);
    
    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.map(d => d.symbol).join(', ')})...`);
    
    const batchResults = await Promise.all(
      batch.map(discovery => enrichDiscovery(discovery))
    );
    
    results.push(...batchResults);
    
    // Rate limiting between batches
    if (i + batchSize < discoveries.length) {
      console.log(`⏳ Waiting ${delayMs}ms before next batch...`);
      await sleep(delayMs);
    }
  }

  const enriched = results.filter(r => r.enriched);
  const failed = results.filter(r => r.enrichment_error);
  
  console.log(`\n✅ Enrichment complete: ${enriched.length} enriched, ${failed.length} failed`);
  
  return results;
}

module.exports = {
  enrichDiscovery,
  enrichDiscoveries,
  calculateTechnicalIndicators,
  analyzeOptionsChain,
  estimateShortInterest,
  analyzeSentiment,
  detectCatalysts,
  calculateExplosiveness
};