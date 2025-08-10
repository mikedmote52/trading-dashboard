module.exports = class ActionMapper {
  constructor(cfg) { this.cfg = cfg; }
  map(composite, tech) {
    const t = this.cfg.technicals;
    const okTech = tech
      && tech.vwap_held_or_reclaimed === true
      && tech.ema9 >= tech.ema20
      && tech.atr_pct >= t.atr_pct_min
      && tech.rsi >= t.rsi_buy_min
      && tech.rsi <= t.rsi_buy_max;
    if (composite >= 75 && okTech) return 'BUY';
    if (composite >= 70) return 'WATCHLIST';
    return 'NO ACTION';
  }
};