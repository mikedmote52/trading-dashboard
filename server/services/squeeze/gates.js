module.exports = class Gates {
  constructor(cfg){ this.cfg = cfg; }
  apply(rows){
    const th = this.cfg.thresholds;
    const ex = this.cfg.exclusions;
    const passed = [];
    const drops = {};
    for (const r of rows){
      const reasons=[];
      if (r._held) reasons.push('portfolio_exclusion');
      
      // VIGL criteria: Price must be > $0.50 
      if ((r.price||0) <= (th.price_min || 0.50)) reasons.push('price_below_minimum');
      
      if (r.float_shares > th.float_shares_max) reasons.push('float_exceeds_max');
      if ((r.short_interest_pct||0) <= th.short_interest_pct_min) reasons.push('si_below_min');
      if ((r.days_to_cover||0) <= th.days_to_cover_min) reasons.push('dtc_below_min');
      if ((r.borrow_fee_pct||0) <= th.borrow_fee_pct_min) reasons.push('borrow_fee_below_min');
      if ((r.borrow_fee_trend_pp7d||0) < th.borrow_fee_trend_min_pp_7d) reasons.push('borrow_fee_trend_not_rising');
      if ((r.avg_dollar_liquidity_30d||0) <= th.avg_dollar_liquidity_min) reasons.push('liquidity_below_min');

      const c = r.catalyst;
      // Allow stocks without catalysts to proceed (they'll score lower in the scorer)
      // Only block if we have an invalid catalyst that's supposed to be in window but isn't
      if (c && c.date_valid && (c.days_to_event < th.catalyst_window_days_min || c.days_to_event > th.catalyst_window_days_max)){
        reasons.push('catalyst_invalid_or_out_of_window');
      }

      if (ex.exclude_halts_today && r.halts_today) reasons.push('halts_today');
      if (ex.max_spread_pct && r.spread_pct_today > ex.max_spread_pct) reasons.push('excessive_spread');

      if (r.freshness && r.freshness.short_interest_age_days > (this.cfg.freshness.short_interest_max_age_days||14)){
        reasons.push('stale_short_interest');
      }

      if (reasons.length===0) passed.push(r); else drops[r.ticker]=reasons;
    }
    return { passed, drops };
  }
};