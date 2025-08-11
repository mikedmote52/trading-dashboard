module.exports = class ActionMapper {
  constructor(cfg) { this.cfg = cfg; }
  map(composite, tech) {
    // Adjusted thresholds based on actual score ranges (1.5-7.0)
    if (composite >= 5.0) {
      // For high scores, check if we have technical confirmation
      if (this._hasTechnicalConfirmation(tech)) {
        return 'BUY';
      } else {
        // High score but no technical confirmation - still watchlist worthy
        return 'WATCHLIST';
      }
    }
    
    if (composite >= 3.0) return 'WATCHLIST';
    if (composite >= 2.0) return 'MONITOR';  // Track moderate scores
    
    return 'NO ACTION';
  }
  
  _hasTechnicalConfirmation(tech) {
    if (!tech) return false;
    
    const t = this.cfg.technicals;
    
    // Check technical indicators if available
    const hasVwapConfirmation = tech.vwap_held_or_reclaimed === true;
    const hasEmaConfirmation = tech.ema9 && tech.ema20 && tech.ema9 >= tech.ema20;
    const hasAtrConfirmation = tech.atr_pct && tech.atr_pct >= (t.atr_pct_min || 4);
    const hasRsiConfirmation = tech.rsi && tech.rsi >= (t.rsi_buy_min || 60) && tech.rsi <= (t.rsi_buy_max || 75);
    
    // Require at least 2 out of 4 technical confirmations
    const confirmations = [hasVwapConfirmation, hasEmaConfirmation, hasAtrConfirmation, hasRsiConfirmation].filter(Boolean);
    return confirmations.length >= 2;
  }
};