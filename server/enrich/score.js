/**
 * Composite scoring system for trading opportunities
 * Combines base VIGL/Alpha scores with momentum, squeeze, sentiment, options, and technical factors
 */

/**
 * Default weights for composite scoring
 * Remaining 0.20 weight is reserved for existing Alpha/VIGL catalyst scores
 */
const DEFAULT_WEIGHTS = {
  wMomentum: 0.25,
  wSqueeze: 0.20,
  wSentiment: 0.15,
  wOptions: 0.10,
  wTechnical: 0.10
};

/**
 * Calculate sub-scores from enrichment data
 * @param {Object} e - Enrichment data object
 * @returns {Object} Sub-scores (momentum, squeeze, sentiment, options, technical)
 */
function subScores(e) {
  const momentum = clamp01(
    norm(e.momentum.relVol, 1, 5) * 0.4 +
    norm(e.momentum.atrPct, 0.02, 0.08) * 0.3 +
    band(e.momentum.rsi, 60, 70) * 0.3
  );

  const squeeze = clamp01(
    norm(e.squeeze.shortPct, 10, 30) * 0.4 +
    norm(e.squeeze.borrowFee, 10, 50) * 0.3 +
    norm(e.squeeze.util, 70, 98) * 0.3
  );

  const sentiment = clamp01(norm(e.sentiment.score, 0, 1));

  const options = clamp01(
    norm(e.options.callPutRatio, 1.2, 3) * 0.5 +
    norm(e.options.ivPctile, 60, 95) * 0.5
  );

  const technical = clamp01(
    (e.technical.ema9_gt_ema20 ? 0.6 : 0) +
    (e.technical.holdingVWAP ? 0.4 : 0)
  );

  return { momentum, squeeze, sentiment, options, technical };
}

/**
 * Calculate composite score from base score and sub-scores
 * @param {number} baseScore - Base score from VIGL/Alpha (0-100)
 * @param {Object} subs - Sub-scores from subScores()
 * @param {Object} weights - Weight configuration
 * @returns {number} Composite score (0-100, rounded)
 */
function composite(baseScore, subs, weights = DEFAULT_WEIGHTS) {
  const s = baseScore / 100; // normalize base score to 0-1
  
  const comp = clamp01(
    s * 0.20 + // Base catalyst score gets 20% weight
    subs.momentum * weights.wMomentum +
    subs.squeeze * weights.wSqueeze +
    subs.sentiment * weights.wSentiment +
    subs.options * weights.wOptions +
    subs.technical * weights.wTechnical
  ) * 100;

  return Math.round(comp);
}

/**
 * Normalize value to 0-1 range
 * @param {number|null} v - Value to normalize
 * @param {number} a - Minimum value
 * @param {number} b - Maximum value
 * @returns {number} Normalized value (0-1)
 */
function norm(v, a, b) {
  if (v == null) return 0;
  return clamp01((v - a) / (b - a));
}

/**
 * Band scoring - returns 0 below lo, 1 above hi, linear in between
 * @param {number|null} v - Value to score
 * @param {number} lo - Lower bound
 * @param {number} hi - Upper bound
 * @returns {number} Band score (0-1)
 */
function band(v, lo, hi) {
  if (v == null) return 0;
  if (v < lo) return 0;
  if (v > hi) return 1;
  return (v - lo) / (hi - lo);
}

/**
 * Clamp value to 0-1 range
 * @param {number} x - Value to clamp
 * @returns {number} Clamped value
 */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

module.exports = {
  subScores,
  composite,
  DEFAULT_WEIGHTS
};