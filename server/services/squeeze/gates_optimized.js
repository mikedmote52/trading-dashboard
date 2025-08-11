/**
 * Optimized Gates - Progressive Filtering Approach
 * 
 * Stage 1: Hard elimination filters (only basic liquidity/safety)
 * Stage 2: Scoring penalties instead of elimination  
 * Stage 3: Technical momentum prioritization
 */

module.exports = class GatesOptimized {
  constructor(cfg){ 
    this.cfg = cfg; 
    this.th = cfg.thresholds;
    this.bonuses = cfg.bonuses || {};
  }

  apply(rows) {
    const passed = [];
    const drops = {};
    
    for (const r of rows) {
      const result = this.evaluateStock(r);
      
      if (result.hardElimination.length > 0) {
        // Hard elimination - safety/liquidity issues
        drops[r.ticker] = result.hardElimination;
      } else {
        // Stock passes basic safety checks - add scoring metadata
        r._gateScore = result.gateScore;
        r._gateBonus = result.bonuses;
        r._gatePenalties = result.penalties;
        r._progressiveFlags = result.flags;
        
        passed.push(r);
      }
    }
    
    return { passed, drops };
  }
  
  evaluateStock(r) {
    const hardElimination = [];
    const penalties = [];
    const bonuses = [];
    const flags = {};
    let gateScore = 50; // Base score
    
    // STAGE 1: HARD ELIMINATION (Safety/Basic Liquidity Only)
    
    if (r._held) {
      hardElimination.push('portfolio_exclusion');
      return { hardElimination, penalties, bonuses, flags, gateScore: 0 };
    }
    
    // Price safety (VIGL criteria) - be more flexible with price sources
    const currentPrice = r.price || r.technicals?.price || r.currentPrice || 0;
    if (currentPrice <= 0) {
      hardElimination.push('no_price_data');
    } else if (currentPrice <= (this.th.price_min || 0.50)) {
      hardElimination.push('price_below_minimum');
    }
    
    // Basic liquidity safety - make optional for testing
    const liquidity = r.avg_dollar_liquidity_30d || 0;
    if (liquidity > 0 && liquidity <= 500000) { // Only enforce if we have data
      hardElimination.push('insufficient_liquidity');
    }
    
    // Extreme float exclusion (only massive floats) - make optional for testing
    const floatShares = r.float_shares || 0;
    if (floatShares > 0 && floatShares > (this.th.float_shares_max || 500000000)) {
      hardElimination.push('float_exceeds_max');
    }
    
    // Safety exclusions
    if (this.cfg.exclusions?.exclude_halts_today && r.halts_today) {
      hardElimination.push('halts_today');
    }
    
    if (this.cfg.exclusions?.max_spread_pct && r.spread_pct_today > this.cfg.exclusions.max_spread_pct) {
      hardElimination.push('excessive_spread');
    }
    
    // If any hard elimination, return early
    if (hardElimination.length > 0) {
      return { hardElimination, penalties, bonuses, flags, gateScore: 0 };
    }
    
    // STAGE 2: PROGRESSIVE SCORING (No elimination, just scoring)
    
    // Technical Momentum Scoring (Primary)
    const vol = r.technicals?.rel_volume || (r.technicals?.volume || 0) / (r.avg_volume_30d || 1);
    if (vol >= (this.th.volume_spike_preferred || 3.0)) {
      gateScore += this.bonuses.high_volume_spike || 15;
      bonuses.push('high_volume_spike');
      flags.hasVolumeSpike = true;
    } else if (vol >= (this.th.rel_volume_min || 1.5)) {
      gateScore += 5; // Moderate volume bonus
      flags.hasModerateVolume = true;
    } else {
      gateScore -= 10; // Low volume penalty
      penalties.push('low_volume');
    }
    
    // RSI momentum scoring
    const rsi = r.technicals?.rsi || 50;
    if (rsi <= 35 && vol >= 2) {
      gateScore += this.bonuses.oversold_bounce || 8;
      bonuses.push('oversold_bounce');
      flags.oversoldWithVolume = true;
    } else if (rsi >= 60 && rsi <= 75) {
      gateScore += 5; // Bullish momentum
      flags.bullishMomentum = true;
    }
    
    // Price action scoring
    if (r.technicals?.price_change_1d_pct > 5) {
      gateScore += this.bonuses.momentum_breakout || 15;
      bonuses.push('momentum_breakout');
      flags.hasBreakout = true;
    }
    
    // Short Interest Scoring (Secondary - not elimination)
    const si = r.short_interest_pct || 0;
    if (si >= (this.th.short_interest_pct_preferred || 20)) {
      gateScore += this.bonuses.strong_short_interest || 20;
      bonuses.push('strong_short_interest');
      flags.highShortInterest = true;
    } else if (si >= 10) {
      gateScore += 8; // Moderate short interest bonus
      flags.moderateShortInterest = true;
    } else if (si < 5) {
      gateScore -= 5; // Low short interest minor penalty
      penalties.push('low_short_interest');
    }
    
    // Days to Cover scoring
    const dtc = r.days_to_cover || 0;
    if (dtc >= (this.th.days_to_cover_preferred || 3)) {
      gateScore += 10;
      flags.goodDaysToCover = true;
    } else if (dtc < 1) {
      gateScore -= 5;
      penalties.push('low_days_to_cover');
    }
    
    // Borrow Fee scoring
    const borrowFee = r.borrow_fee_pct || 0;
    if (borrowFee >= (this.th.borrow_fee_pct_preferred || 8)) {
      gateScore += 12;
      flags.highBorrowFee = true;
    }
    
    if (r.borrow_fee_trend_pp7d > 0) {
      gateScore += this.bonuses.rising_borrow_fees || 10;
      bonuses.push('rising_borrow_fees');
      flags.risingBorrowFees = true;
    }
    
    // Catalyst scoring (Tertiary)
    const catalyst = r.catalyst;
    if (catalyst && catalyst.verified_in_window) {
      gateScore += this.bonuses.catalyst_in_window || 12;
      bonuses.push('catalyst_in_window');
      flags.hasCatalyst = true;
    } else if (catalyst && catalyst.type) {
      gateScore += 5; // Any catalyst gets some points
      flags.hasEstimatedCatalyst = true;
    }
    
    // Liquidity bonus scoring
    const liquidityAmount = r.avg_dollar_liquidity_30d || 0;
    if (liquidityAmount >= 10000000) { // $10M+
      gateScore += 8;
      flags.highLiquidity = true;
    } else if (liquidityAmount >= 5000000) { // $5M+
      gateScore += 4;
      flags.goodLiquidity = true;
    }
    
    // Age/Freshness scoring (not elimination)
    if (r.freshness?.short_interest_age_days > 30) {
      gateScore -= 5;
      penalties.push('stale_data');
    }
    
    // Estimation penalty (prefer real data but don't eliminate estimates)
    if (r.estimated) {
      gateScore -= 3; // Small penalty for estimated vs real data
      flags.hasEstimatedData = true;
    }
    
    return {
      hardElimination: [],
      penalties,
      bonuses,
      flags,
      gateScore: Math.max(0, gateScore) // Don't go below 0
    };
  }
};