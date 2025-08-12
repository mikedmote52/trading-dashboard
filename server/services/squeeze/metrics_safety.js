// Resilience layer for VIGL discovery system
// Handles missing data gracefully with estimations and dynamic scoring

const safeNum = (v, defaultValue = null) => {
  if (v === null || v === undefined || v === '') return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
};

const pct = (v) => {
  const n = safeNum(v);
  return n == null ? null : Math.round(n * 100) / 100;
};

const truthy = (v) => v !== undefined && v !== null && v !== '';

// Estimate short interest when exact value is unavailable
// Uses tiered heuristic approach to always return something useful
function estimateShortInterest({
  daysToCover,      // if we can compute = short_shares / avg_vol
  borrowFee,        // from brokers or vendors
  utilization,      // if available
  optionsCPRatio,   // call/put ratio (proxy of squeeze pressure)
  relVolume,        // relative volume today
  floatShares,      // shares float
  price,            // current price for context
  volatility        // price volatility for context
}) {
  // 1) If daysToCover present, map to short % using float estimate
  if (truthy(daysToCover) && truthy(floatShares)) {
    // Back-of-envelope: assume 5d ADV baseline → short% ≈ min(100, 15*DTC)
    const pctSI = Math.max(0, Math.min(100, 15 * safeNum(daysToCover, 0)));
    return { value: pctSI, method: 'daysToCover', confidence: 0.7 };
  }

  // 2) If borrowFee/utilization present, map to percentile-based proxy
  if (truthy(borrowFee) || truthy(utilization)) {
    const fee = Math.min(200, Math.max(0, safeNum(borrowFee, 0))); // cap 200%
    const util = Math.min(100, Math.max(0, safeNum(utilization, 0)));
    // Blend → rough correlation proxy
    const proxy = 0.4 * (fee / 3) + 0.6 * util; // 0..100 range
    return { value: Math.round(proxy), method: 'borrowFee_utilization', confidence: 0.6 };
  }

  // 3) If strong call-bias + high relVol, infer elevated squeeze interest
  if (truthy(optionsCPRatio) && truthy(relVolume)) {
    const cp = safeNum(optionsCPRatio, 1);
    const rv = Math.min(10, Math.max(0, safeNum(relVolume, 1))); // cap 10x
    const proxy = Math.min(100, Math.round(8 * Math.max(0, cp - 1) * rv));
    return { value: proxy, method: 'options_relVol', confidence: 0.5 };
  }

  // 4) High volatility + volume spike suggests institutional activity
  if (truthy(volatility) && truthy(relVolume)) {
    const vol = Math.min(100, Math.max(0, safeNum(volatility, 20))); // 0-100%
    const rv = Math.min(5, Math.max(0, safeNum(relVolume, 1))); // cap 5x
    if (vol > 40 && rv > 2) {
      const proxy = Math.min(50, Math.round(vol * rv / 4)); // conservative estimate
      return { value: proxy, method: 'volatility_volume', confidence: 0.3 };
    }
  }

  // 5) Price-based heuristic for small caps (higher short interest typically)
  if (truthy(price)) {
    const p = safeNum(price, 50);
    if (p < 10) {
      return { value: 25, method: 'smallcap_default', confidence: 0.2 };
    } else if (p < 50) {
      return { value: 15, method: 'midcap_default', confidence: 0.15 };
    }
  }

  // 6) No signal → return conservative default
  return { value: 8, method: 'market_baseline', confidence: 0.1 };
}

// Dynamic composite score: weights adjust when components are missing
function compositeScore(parts) {
  const baseWeights = {
    volumeMomentum: 0.25,    // most reliable signal
    squeezePotential: 0.20,  // short interest proxy
    catalyst: 0.20,          // news/events
    sentiment: 0.15,         // social/news sentiment
    options: 0.10,           // options flow
    technical: 0.10,         // price action
  };

  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const [component, weight] of Object.entries(baseWeights)) {
    const value = parts[component]; // 0..100 or null
    if (value != null && value >= 0) {
      weightedSum += value * weight;
      totalWeight += weight;
    }
  }
  
  // If we have some components, normalize to 0-100 range
  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  
  // Apply penalty for missing critical components
  const criticalComponents = ['volumeMomentum', 'squeezePotential'];
  const missingCritical = criticalComponents.filter(c => parts[c] == null).length;
  const penalty = missingCritical * 5; // 5 points per missing critical component
  
  const finalScore = Math.max(0, Math.min(100, score - penalty));
  
  return {
    score: finalScore,
    componentsUsed: Object.keys(parts).filter(k => parts[k] != null).length,
    totalComponents: Object.keys(parts).length,
    missingCritical,
    confidence: totalWeight / Object.values(baseWeights).reduce((a, b) => a + b, 0)
  };
}

// Generate volume momentum score (0-100)
function volumeMomentumScore(relVolume, avgVolume, currentVolume) {
  const rv = Math.max(0, safeNum(relVolume, 1));
  
  // Exponential scoring for volume spikes
  if (rv >= 10) return 100;      // 10x+ volume = max score
  if (rv >= 5) return 85;        // 5x volume = very strong
  if (rv >= 3) return 70;        // 3x volume = strong  
  if (rv >= 2) return 50;        // 2x volume = moderate
  if (rv >= 1.5) return 30;      // 1.5x volume = mild
  
  return Math.max(0, Math.round(rv * 20)); // Linear below 1.5x
}

// Generate squeeze potential score based on short metrics
function squeezePotentialScore(shortInterest, daysToCover, borrowFee, utilization) {
  let score = 0;
  let factors = 0;
  
  // Short interest contribution
  const si = safeNum(shortInterest);
  if (si != null) {
    if (si >= 30) score += 40;        // 30%+ SI = very high squeeze potential
    else if (si >= 20) score += 30;   // 20%+ SI = high squeeze potential  
    else if (si >= 10) score += 20;   // 10%+ SI = moderate squeeze potential
    else score += Math.round(si / 2); // Linear scaling below 10%
    factors++;
  }
  
  // Days to cover contribution
  const dtc = safeNum(daysToCover);
  if (dtc != null) {
    if (dtc >= 10) score += 25;       // 10+ days = very hard to cover
    else if (dtc >= 5) score += 20;   // 5+ days = hard to cover
    else if (dtc >= 3) score += 15;   // 3+ days = moderate difficulty
    else score += Math.round(dtc * 3); // Linear scaling
    factors++;
  }
  
  // Borrow fee contribution
  const fee = safeNum(borrowFee);
  if (fee != null) {
    if (fee >= 50) score += 20;       // 50%+ fee = very expensive to short
    else if (fee >= 20) score += 15;  // 20%+ fee = expensive to short
    else if (fee >= 10) score += 10;  // 10%+ fee = moderate cost
    else score += Math.round(fee / 2); // Linear scaling
    factors++;
  }
  
  // Utilization contribution  
  const util = safeNum(utilization);
  if (util != null) {
    if (util >= 90) score += 15;      // 90%+ util = very hard to borrow
    else if (util >= 70) score += 10; // 70%+ util = hard to borrow
    else if (util >= 50) score += 5;  // 50%+ util = moderate difficulty
    factors++;
  }
  
  // Return average score if we have any factors, else 0
  return factors > 0 ? Math.min(100, Math.round(score / factors)) : 0;
}

// Safe price formatting for display
function formatPrice(price, decimals = 2) {
  const p = safeNum(price);
  return p != null ? p.toFixed(decimals) : '—';
}

// Safe percentage formatting
function formatPercent(value, decimals = 1) {
  const v = safeNum(value);
  return v != null ? `${v.toFixed(decimals)}%` : '—';
}

// Safe multiplier formatting (e.g., volume)
function formatMultiplier(value, decimals = 1, suffix = 'x') {
  const v = safeNum(value);
  return v != null ? `${v.toFixed(decimals)}${suffix}` : '—';
}

module.exports = {
  safeNum,
  pct,
  truthy,
  estimateShortInterest,
  compositeScore,
  volumeMomentumScore,
  squeezePotentialScore,
  formatPrice,
  formatPercent,
  formatMultiplier
};