function clamp(x, lo=0, hi=100){ return Math.max(lo, Math.min(hi, x)); }
function lin(x, x0, y0, x1, y1){
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + (y1 - y0) * (x - x0)/(x1 - x0);
}

module.exports = class Scorer {
  constructor(cfg){
    this.cfg = cfg;
    this.weights = cfg.weights[cfg.preset] || cfg.weights.june_july_proven;
  }
  score(t){
    const siSub  = clamp(lin(t.short_interest_pct, 30, 60, 60, 100));
    const dtcSub = clamp(lin(t.days_to_cover, 7, 60, 20, 100));
    const fee    = t.borrow_fee_pct || 0;
    const base   = clamp(lin(fee, 15, 60, 60, 100));
    const trend  = t.borrow_fee_trend_pp7d || 0;
    const bonus  = trend >= 5 ? 10 : trend > 0 ? 5 : 0;
    const feeSub = clamp(base + bonus);

    const squeezeCore = ((0.25*siSub + 0.15*dtcSub + 0.15*feeSub) / 0.55);

    const cat = t.catalyst && t.catalyst.date_valid
      ? clamp(lin(t.catalyst.days_to_event, 30, 70, 14, 100)) * (t.catalyst.cred || 1)
      : 0;

    const liq = t.avg_dollar_liquidity_30d || 0;
    const liqSub = liq >= 5e7 ? 100 : liq >= 1.5e7 ? 80 : liq >= 5e6 ? 60 : 0;

    let techSub = 50;
    const tech = t.technicals || {};
    if (tech.ema9 >= tech.ema20) techSub += 15;
    if (tech.vwap_held_or_reclaimed) techSub += 15;
    if (tech.atr_pct >= this.cfg.technicals.atr_pct_min) techSub += 10;
    if (tech.rsi >= 60 && tech.rsi <= 70) techSub += 10;
    if (tech.rsi > 80) techSub -= 20;
    techSub = clamp(techSub);

    const w = this.weights;
    const composite = clamp(
      (w.squeeze||0.55)*squeezeCore +
      (w.catalyst||0.25)*cat +
      (w.liquidity||0.10)*liqSub +
      (w.technicals||0.10)*techSub
    );

    return { composite, subscores:{siSub, dtcSub, feeSub, cat, liqSub, techSub}, weights:w };
  }
};