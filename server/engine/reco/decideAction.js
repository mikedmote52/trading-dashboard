/**
 * Unified Decision Engine for Trading Actions
 * Used by both AlphaStack (discovery) and LPI v2 (portfolio) UIs
 */

function decideAction({ scoreBundle = null, position = null, thesisTrend = null }) {
  const ticker = scoreBundle?.ticker || position?.ticker || 'UNKNOWN';
  
  // Extract key metrics
  const score = scoreBundle?.score || scoreBundle?.vigl_score || 0;
  const rvol = scoreBundle?.intraday?.rvol || scoreBundle?.rvol || 1.0;
  const vwapReclaimed = scoreBundle?.intraday?.vwap_reclaimed ?? true;
  const ema9Over20 = scoreBundle?.intraday?.ema9_over_20 ?? true;
  
  // Position metrics (if position exists)
  const pnlPct = position?.unrealized_pnl_pct || 0;
  const exposure = position?.exposure_usd || position?.market_value || 0;
  const shares = position?.shares || position?.qty || 0;
  const hasPosition = shares > 0;
  
  // Decision logic with clear priority order
  let action, confidence, reasonCodes = [];
  
  // SELL conditions (highest priority)
  if (hasPosition && (thesisTrend === 'Broken' || pnlPct < -20)) {
    action = 'SELL';
    confidence = 0.85;
    reasonCodes = ['THESIS_BROKEN', 'STOP_LOSS'];
    if (pnlPct < -20) reasonCodes.push('LOSS_LIMIT');
    if (!vwapReclaimed) reasonCodes.push('VWAP_LOST');
    if (rvol < 1.5) reasonCodes.push('VOL_FADE');
  }
  else if (hasPosition && pnlPct < -15 && (!vwapReclaimed || rvol < 1.5)) {
    action = 'SELL';
    confidence = 0.80;
    reasonCodes = ['LOSS', 'VWAP_LOST', 'VOL_FADE'];
  }
  else if (hasPosition && score < 30 && rvol < 0.5) {
    action = 'SELL';
    confidence = 0.75;
    reasonCodes = ['SCORE_WEAK', 'VOL_DRY'];
  }
  
  // TRIM conditions
  else if (hasPosition && pnlPct > 30 && score < 50) {
    action = 'TRIM';
    confidence = 0.75;
    reasonCodes = ['PROFITS', 'SCORE_WEAK'];
  }
  else if (hasPosition && pnlPct > 50) {
    action = 'TRIM';
    confidence = 0.85;
    reasonCodes = ['PROFITS', 'SECURE_GAINS'];
  }
  
  // BUY_MORE conditions
  else if (score > 70 && rvol > 3 && (!hasPosition || pnlPct < 10)) {
    action = 'BUY_MORE';
    confidence = 0.85;
    reasonCodes = ['SCORE_HIGH', 'VOL_SURGE'];
    if (thesisTrend === 'Strengthening') reasonCodes.push('THESIS_STRONG');
  }
  else if (score > 60 && vwapReclaimed && ema9Over20 && (!hasPosition || (pnlPct > -5 && pnlPct < 15))) {
    action = 'BUY_MORE';
    confidence = 0.70;
    reasonCodes = ['SCORE_GOOD', 'VWAP_RECLAIM', 'EMA_BULL'];
  }
  
  // HOLD (default for positions)
  else if (hasPosition) {
    action = 'HOLD';
    confidence = Math.min(0.70, 0.50 + (score / 100));
    reasonCodes = score > 50 ? ['MONITOR', 'SCORE_OK'] : ['MONITOR'];
    if (thesisTrend === 'Stable') reasonCodes.push('THESIS_OK');
  }
  
  // No action for non-positions with weak signals
  else {
    action = 'HOLD';
    confidence = 0.40;
    reasonCodes = ['MONITOR'];
  }
  
  // Generate suggested amounts based on action
  let suggestedAmount = null;
  if (action === 'BUY_MORE') {
    const baseAmount = hasPosition ? Math.min(5000, exposure * 0.5) : 2500;
    suggestedAmount = `Add $${baseAmount.toFixed(0)}`;
  } else if (action === 'TRIM') {
    const trimPct = pnlPct > 50 ? 75 : 50;
    suggestedAmount = `Trim ${trimPct}% (${Math.floor(shares * trimPct / 100)} shares)`;
  } else if (action === 'SELL') {
    suggestedAmount = `Exit full position (${shares} shares)`;
  }
  
  // Risk assessment
  let urgency = 'LOW';
  if (action === 'SELL' && (pnlPct < -20 || thesisTrend === 'Broken')) urgency = 'HIGH';
  else if (action === 'BUY_MORE' && score > 75 && rvol > 5) urgency = 'HIGH';
  else if (action === 'TRIM' && pnlPct > 50) urgency = 'MEDIUM';
  
  // Calculate add_usd for BUY_MORE actions
  let addUsd = null;
  if (action === 'BUY_MORE') {
    if (hasPosition) {
      // Add percentage of current exposure
      addUsd = Math.min(5000, Math.max(500, exposure * 0.25));
    } else {
      // Initial position size
      addUsd = score > 70 ? 2500 : 1500;
    }
    addUsd = Math.round(addUsd);
  }

  return {
    ticker,
    action,
    confidence,
    reason_codes: reasonCodes,
    suggested_amount: suggestedAmount,
    add_usd: addUsd,
    urgency,
    score: score,
    metrics: {
      pnl_pct: pnlPct,
      rvol,
      vwap_reclaimed: vwapReclaimed,
      ema9_over_20: ema9Over20,
      thesis_trend: thesisTrend
    }
  };
}

module.exports = { decideAction };