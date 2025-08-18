function pct(n, d=0){ return `${(Number(n)*100).toFixed(d)}%`; }

exports.deriveAlphaThesis = function(candidate){
  const m = candidate.metrics || candidate;
  const parts = [];
  if (m.rvol) parts.push(`RVOL ${Number(m.rvol).toFixed(1)}×`);
  if (m.shortInterestPct != null) parts.push(`SI ${Number(m.shortInterestPct)}%`);
  if (m.borrowFee != null) parts.push(`Fee ${Number(m.borrowFee)}%`);
  if (m.utilization != null) parts.push(`Util ${pct(m.utilization,0)}`);
  if (m.ema9_gt_ema20) parts.push(`EMA9>20`);
  if (m.vwapDelta != null) parts.push(m.vwapDelta >= 0 ? `above VWAP` : `below VWAP`);
  if (m.rsi) parts.push(`RSI ${Number(m.rsi)}`);
  if (m.ivPercentile != null) parts.push(`IVp ${pct(m.ivPercentile,0)}`);
  if (m.atrPct != null) parts.push(`ATR ${pct(m.atrPct,0)}`);
  
  const thesis = `Squeeze setup: ${parts.join(" · ")}`;
  
  const reasons = [
    m.rvol && {key:"volume_momentum",label:"Volume Momentum",value:`RVOL ${Number(m.rvol).toFixed(1)}×`,weight:0.25},
    (m.shortInterestPct!=null||m.borrowFee!=null||m.utilization!=null) && {
      key:"float_short",label:"Short Squeeze Setup",
      value:[m.shortInterestPct!=null?`SI ${m.shortInterestPct}%`:null, m.borrowFee!=null?`Fee ${m.borrowFee}%`:null, m.utilization!=null?`Util ${pct(m.utilization,0)}`:null].filter(Boolean).join(", "),
      weight:0.2
    },
    (m.ema9_gt_ema20||m.vwapDelta!=null||m.rsi) && {
      key:"technical",label:"Technical",
      value:[m.ema9_gt_ema20?`EMA9>20`:null, m.vwapDelta!=null?(m.vwapDelta>=0?`above VWAP`:`below VWAP`):null, m.rsi?`RSI ${m.rsi}`:null].filter(Boolean).join("; "),
      weight:0.2
    },
    (m.callPutRatio!=null||m.ivPercentile!=null) && {
      key:"options_sentiment",label:"Options/Sentiment",
      value:[m.callPutRatio!=null?`C/P ${Number(m.callPutRatio).toFixed(1)}`:null, m.ivPercentile!=null?`IVp ${pct(m.ivPercentile,0)}`:null].filter(Boolean).join("; "),
      weight:0.15
    }
  ].filter(Boolean);
  
  return { thesis, reasons };
};