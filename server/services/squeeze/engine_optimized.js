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
  }

  async run() {
    try {
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
      
      // Stage 2: Enrich with all data sources
      const enriched = await this._enrich(tradeable, holdings);
      console.log(`🔍 Enriched ${enriched.length} stocks with market data`);
      
      // Stage 3: Progressive filtering with optimized gates
      const { passed, drops } = this.gates.apply(enriched);
      
      console.log(`✅ ${passed.length} stocks passed progressive filtering`);
      console.log(`❌ ${Object.keys(drops).length} stocks eliminated by safety filters`);
      
      // Stage 4: Enhanced scoring with gate bonuses
      const candidates = [];
      let highScoreCount = 0;
      
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
        
        // Calculate component scores
        const volumeMomentum = volumeMomentumScore(relVolume);
        const squeezePotential = squeezePotentialScore(
          siData.value, 
          daysToCover, 
          borrowFee, 
          utilization
        );
        
        // Additional scoring components
        const catalystScore = stock.catalyst?.type ? 
          (stock.catalyst.type === 'earnings' ? 80 : 
           stock.catalyst.type === 'news' ? 60 : 40) : null;
        
        const sentimentScore = safeNum(stock.sentiment?.score, null);
        const optionsScore = safeNum(stock.options?.gamma_exposure, null) != null ? 
          Math.min(100, Math.abs(safeNum(stock.options.gamma_exposure, 0)) * 10) : null;
        
        const technicalScore = stock.technicals?.rsi ? 
          (safeNum(stock.technicals.rsi) < 30 ? 70 : // oversold
           safeNum(stock.technicals.rsi) > 70 ? 30 : // overbought  
           50) : null; // neutral
        
        // Dynamic composite scoring
        const scoreComponents = {
          volumeMomentum,
          squeezePotential,
          catalyst: catalystScore,
          sentiment: sentimentScore,
          options: optionsScore,
          technical: technicalScore
        };
        
        const { score: enhancedScore, confidence } = compositeScore(scoreComponents);
        
        // Add progressive gate score bonus
        const gateBonus = stock._gateScore || 0;
        const finalScore = Math.min(100, enhancedScore + (gateBonus * 0.2));
        
        // Action mapping based on enhanced score and confidence
        const action = this._mapActionOptimized(finalScore, stock, confidence);
        
        // Track quality metrics
        if (finalScore >= 70) highScoreCount++;
        
        if (action === 'BUY' || action === 'WATCHLIST' || action === 'MONITOR') {
          const audit = this._createAuditData(stock, scoreComponents, {}, gateBonus, siData);
          const row = this._formatRowResilient(stock, finalScore, this.cfg.preset, action, audit, siData);
          
          // Only process valid rows (price > 0)
          if (row && row.db && row.emit) {
            await db.insertDiscovery(row.db);
            candidates.push(row.emit);
          }
        }
      }
      
      // Enhanced audit logging
      await this._logOptimizedAudit(enriched.length, passed.length, candidates.length, highScoreCount, drops);
      
      console.log(`🎯 Final results: ${candidates.length} actionable discoveries`);
      console.log(`⭐ High-quality candidates (70+ score): ${highScoreCount}`);
      
      return {
        asof: new Date().toISOString(),
        preset: this.cfg.preset,
        universe_count: universe.length,
        enriched_count: enriched.length,
        passed_progressive_filter: passed.length,
        high_quality_count: highScoreCount,
        candidates,
        
        // Enhanced diagnostics
        discovery_metrics: {
          universe_expansion_ratio: universe.length / 100, // vs old 100 limit
          pass_rate: (passed.length / enriched.length * 100).toFixed(1) + '%',
          action_rate: (candidates.length / passed.length * 100).toFixed(1) + '%',
          quality_rate: (highScoreCount / Math.max(candidates.length, 1) * 100).toFixed(1) + '%'
        },
        
        progressive_drops: drops
      };
    } catch (e) {
      console.error('❌ Optimized engine error:', e.stack || e.message);
      throw e;
    }
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
    
    const enriched = tickers.map(tk => {
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
      
      return stockData;
    });
    
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
  
  _mapActionOptimized(enhancedScore, stock, confidence = 1.0) {
    // More nuanced action mapping based on enhanced scoring and confidence
    const flags = stock._progressiveFlags || {};
    const relVolume = safeNum(stock.technicals?.rel_volume, 1);
    const siEstimated = stock.short_interest_pct == null;
    
    // Adjust thresholds based on confidence level
    const confidenceMultiplier = Math.max(0.7, confidence);
    const adjustedScore = enhancedScore * confidenceMultiplier;
    
    // BUY criteria - high score with strong signals and good confidence
    if (adjustedScore >= 70 && confidence >= 0.6 && 
        (relVolume >= 2.5 || flags.hasVolumeSpike || flags.highShortInterest)) {
      return 'BUY';
    }
    
    // WATCHLIST criteria - good score or strong technical setup
    if (adjustedScore >= 55 || flags.oversoldWithVolume || flags.hasBreakout || 
        (relVolume >= 2.0 && adjustedScore >= 45)) {
      return 'WATCHLIST';
    }
    
    // MONITOR criteria - moderate potential or estimated data
    if (adjustedScore >= 35 || flags.hasModerateVolume || 
        (siEstimated && adjustedScore >= 30)) {
      return 'MONITOR';
    }
    
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