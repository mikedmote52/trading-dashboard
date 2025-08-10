function fixedRiskQty(price, stop, riskDollars) {
  const riskPerShare = Math.max(0.01, price - stop);
  return Math.floor(riskDollars / riskPerShare);
}

function plan(discoveries, positions, cfg) {
  const posSet = new Set((positions || []).map(p => p.symbol));
  const riskPerTrade = cfg?.risk_per_trade_usd ?? 200;
  const maxPerName = cfg?.max_position_usd ?? 1500;

  const orders = [];
  for (const d of discoveries) {
    if (posSet.has(d.symbol)) continue;
    const price = +d.price;
    const stop = +(d.stop ?? price * 0.9);
    const qty = Math.max(0, fixedRiskQty(price, stop, riskPerTrade));
    if (!qty || price * qty > maxPerName) continue;
    orders.push({
      symbol: d.symbol, side: 'buy', qty,
      strategy: 'squeeze_vnext',
      stops: { hard: stop, trail: +(price * 0.92).toFixed(2) },
      take_profit: +(price * 1.2).toFixed(2)
    });
  }
  return orders;
}

module.exports = { plan };