function pct(n, d=0){ return `${(Number(n)*100).toFixed(d)}%`; }

exports.deriveAlphaThesis = function(candidate){
  const m = candidate.metrics || candidate;
  const parts = [];
  
  // Map actual data structure fields - no defaults to safe values
  const n = (x) => (x===undefined||x===null||Number.isNaN(Number(x)))?null:Number(x);
  
  const rvol = n(m.rvol ?? m.rel_vol_30m ?? m.rel_vol);
  const shortPct = n(m.shortPct ?? m.short_interest ?? m.shortInterestPct);
  const borrowFee = n(m.borrowFeePct ?? m.borrow_fee ?? m.borrowFee);
  const utilization = n(m.utilizationPct ?? m.utilization);
  const rsi = n(m.technicals?.rsi ?? m.rsi);
  const atrPct = n(m.technicals?.atrPct ?? m.atrPct);
  const vwapRel = n(m.vwapRel ?? m.vwapDelta);
  const emaCross = Boolean(m.technicals?.emaCross ?? m.ema9_gt_ema20);
  const ivPercentile = n(m.options?.ivPctile ?? m.ivPercentile);
  const callPutRatio = n(m.options?.cpr ?? m.callPutRatio);
  
  // Build thesis parts using available data
  const ticker = candidate.ticker || candidate.symbol || 'Stock';
  const price = candidate.price || m.price || 0;
  const changePct = candidate.changePct || m.changePct || m.upside_pct || 0;
  
  // Always add price and change info if available
  if (price > 0) parts.push(`$${Number(price).toFixed(2)}`);
  if (changePct > 0) parts.push(`+${Number(changePct).toFixed(1)}% target`);
  if (rvol && rvol > 1) parts.push(`${Number(rvol).toFixed(1)}× volume`);
  
  // Add any available short interest data
  if (shortPct && shortPct > 0) parts.push(`${Number(shortPct)}% SI`);
  if (borrowFee && borrowFee > 0) parts.push(`${Number(borrowFee)}% fee`);
  if (utilization && utilization > 0) parts.push(`${pct(utilization,0)} util`);
  
  // Add technical indicators if available
  if (emaCross) parts.push(`EMA bull cross`);
  if (vwapRel != null && vwapRel !== 1) parts.push(vwapRel > 1 ? `above VWAP` : `below VWAP`);
  if (rsi && rsi !== 50) parts.push(`RSI ${Number(rsi)}`);
  if (ivPercentile && ivPercentile > 0) parts.push(`${pct(ivPercentile,0)} IV`);
  if (atrPct && atrPct > 0) parts.push(`${pct(atrPct,0)} ATR`);
  
  // Generate a meaningful thesis based on what data we have
  let thesis;
  if (parts.length > 2) {
    thesis = `${ticker} momentum play: ${parts.join(" · ")}`;
  } else if (price > 0 && changePct > 0) {
    thesis = `${ticker} breakout setup at ${parts.join(" · ")}`;
  } else if (parts.length > 0) {
    thesis = `${ticker} technical setup: ${parts.join(" · ")}`;
  } else {
    thesis = m.plan?.entry || candidate.plan?.entry || `${ticker} momentum setup with technical confirmation`;
  }
  
  const reasons = [
    // Price action and momentum
    (price > 0 || changePct > 0) && {
      key:"price_action",
      label:"Price Action",
      value: price > 0 && changePct > 0 
        ? `Current price $${Number(price).toFixed(2)} with ${Number(changePct).toFixed(1)}% upside target`
        : price > 0 
        ? `Trading at $${Number(price).toFixed(2)}`
        : `${Number(changePct).toFixed(1)}% upside potential identified`,
      weight:0.3
    },
    
    // Volume analysis
    rvol && rvol >= 1 && {
      key:"volume_momentum",
      label:"Volume Analysis",
      value: rvol > 1 
        ? `${Number(rvol).toFixed(1)}× relative volume indicates heightened interest`
        : `Normal volume pattern supporting steady accumulation`,
      weight:0.25
    },
    
    // Short interest (if available)
    (shortPct > 0 || borrowFee > 0 || utilization > 0) && {
      key:"float_short",
      label:"Short Interest Setup", 
      value:[
        shortPct > 0 ? `${Number(shortPct)}% short interest` : null,
        borrowFee > 0 ? `${Number(borrowFee)}% borrow fee` : null,
        utilization > 0 ? `${pct(utilization,0)} utilization` : null
      ].filter(Boolean).join(", ") || "Short interest metrics tracked",
      weight:0.2
    },
    
    // Technical indicators
    (emaCross || vwapRel != null || (rsi && rsi !== 50)) && {
      key:"technical",
      label:"Technical Setup",
      value:[
        emaCross ? `EMA crossover confirming bullish momentum` : null,
        vwapRel != null && vwapRel !== 1 ? (vwapRel > 1 ? `Trading above VWAP resistance` : `Approaching VWAP resistance`) : null,
        (rsi && rsi !== 50) ? `RSI ${Number(rsi)} indicating ${rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral'} conditions` : null
      ].filter(Boolean).join("; ") || "Technical patterns support momentum",
      weight:0.15
    },
    
    // Options data (if available)
    (callPutRatio || ivPercentile) && {
      key:"options_sentiment",
      label:"Options Activity",
      value:[
        callPutRatio ? `Call/Put ratio ${Number(callPutRatio).toFixed(1)} ${callPutRatio > 1 ? '(bullish)' : '(bearish)'}` : null,
        ivPercentile ? `IV percentile ${pct(ivPercentile,0)} ${ivPercentile > 50 ? '(elevated)' : '(compressed)'}` : null
      ].filter(Boolean).join("; ") || "Options flow being monitored",
      weight:0.1
    }
  ].filter(Boolean);
  
  return { thesis, reasons };
};