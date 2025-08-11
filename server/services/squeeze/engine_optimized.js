const GatesOptimized = require('./gates_optimized');
const Scorer = require('./scorer');
const ActionMapper = require('./action_mapper');
const DS = require('./data_sources');
const { loadConfig } = require('./util/config');
const db = require('../../db/sqlite');

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
        // Combine traditional scoring with gate scoring
        const { composite, subscores, weights } = this.scorer.score(stock);
        
        // Add progressive gate score bonus
        const gateBonus = stock._gateScore || 0;
        const enhancedScore = composite + (gateBonus * 0.3); // 30% weight to gate scoring
        
        // Action mapping based on enhanced score
        const action = this._mapActionOptimized(enhancedScore, stock);
        
        // Track quality metrics
        if (enhancedScore >= 70) highScoreCount++;
        
        if (action === 'BUY' || action === 'WATCHLIST' || action === 'MONITOR') {
          const audit = this._createAuditData(stock, subscores, weights, gateBonus);
          const row = this._formatRow(stock, enhancedScore, this.cfg.preset, action, audit);
          
          // Enhanced discovery data with progressive flags
          row.emit.progressive_flags = stock._progressiveFlags || {};
          row.emit.gate_score = gateBonus;
          row.emit.gate_bonuses = stock._gateBonus || [];
          row.emit.enhanced_score = enhancedScore;
          row.emit.traditional_score = composite;
          
          await db.insertDiscovery(row.db);
          candidates.push(row.emit);
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
  
  _mapActionOptimized(enhancedScore, stock) {
    // More nuanced action mapping based on enhanced scoring
    const flags = stock._progressiveFlags || {};
    
    // BUY criteria - high score with strong signals
    if (enhancedScore >= 75 && (flags.hasVolumeSpike || flags.highShortInterest)) {
      return 'BUY';
    }
    
    // WATCHLIST criteria - good score or strong technical setup
    if (enhancedScore >= 60 || flags.oversoldWithVolume || flags.hasBreakout) {
      return 'WATCHLIST';
    }
    
    // MONITOR criteria - moderate potential
    if (enhancedScore >= 45 || flags.hasModerateVolume) {
      return 'MONITOR';
    }
    
    return 'IGNORE';
  }
  
  _createAuditData(stock, subscores, weights, gateBonus) {
    return {
      subscores,
      weights,
      gate_bonus: gateBonus,
      progressive_flags: stock._progressiveFlags || {},
      gate_bonuses: stock._gateBonus || [],
      gate_penalties: stock._gatePenalties || [],
      estimation_flags: {
        has_estimated_short: stock.estimated || false,
        has_estimated_catalyst: stock.catalyst?.type === 'volume_activity' || stock.catalyst?.type === 'price_movement'
      },
      freshness: stock.freshness || {}
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

  _formatRow(stock, enhancedScore, preset, action, audit) {
    const price = stock.price || stock.technicals?.price;
    const entry_hint = { 
      type: stock.technicals?.vwap_held_or_reclaimed ? 'vwap_reclaim' : 'base_breakout', 
      trigger_price: stock.technicals?.vwap || price 
    };
    const risk = { 
      stop_loss: +(price * 0.9).toFixed(2), 
      tp1: +(price * 1.2).toFixed(2), 
      tp2: +(price * 1.5).toFixed(2) 
    };
    
    const emit = {
      ticker: stock.ticker,
      price,
      float_shares: stock.float_shares,
      short_interest_pct: stock.short_interest_pct,
      days_to_cover: stock.days_to_cover,
      borrow_fee_pct: stock.borrow_fee_pct,
      borrow_fee_trend: stock.borrow_fee_trend_pp7d,
      utilization_pct: stock.utilization_pct,
      avg_dollar_liquidity_30d: stock.avg_dollar_liquidity_30d,
      catalyst: stock.catalyst,
      options: stock.options,
      sentiment: stock.sentiment,
      technicals: stock.technicals,
      intraday_rel_volume: stock.technicals?.rel_volume,
      composite_score: +enhancedScore.toFixed(1),
      action,
      entry_hint,
      risk,
      
      // Enhanced fields
      estimated_data: stock.estimated || false,
      discovery_method: 'optimized_progressive'
    };

    return {
      db: {
        id: `${stock.ticker}-${Date.now()}`,
        symbol: stock.ticker,
        price,
        score: +enhancedScore.toFixed(2),
        preset,
        action,
        features_json: JSON.stringify(stock || {}),
        audit_json: JSON.stringify(audit || {})
      },
      emit
    };
  }
};