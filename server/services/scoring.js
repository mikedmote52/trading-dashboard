/**
 * Portfolio scoring service with interpretable squeeze score
 */
const { getScoringWeights } = require('../db/sqlite');

/**
 * Get current scoring weights (either from database or defaults)
 * @returns {Object} Current weights
 */
function getCurrentWeights() {
  // Try environment variable first
  try {
    if (process.env.SCORING_WEIGHTS_JSON) {
      return JSON.parse(process.env.SCORING_WEIGHTS_JSON);
    }
  } catch (error) {
    console.log('Invalid SCORING_WEIGHTS_JSON env var:', error.message);
  }
  
  // Try database weights
  try {
    const weightsRecord = getScoringWeights.get();
    if (weightsRecord) {
      return {
        short_interest_weight: weightsRecord.weight_short_interest,
        borrow_fee_weight: weightsRecord.weight_borrow_fee,
        volume_weight: weightsRecord.weight_volume,
        momentum_weight: weightsRecord.weight_momentum,
        catalyst_weight: weightsRecord.weight_catalyst,
        float_penalty_weight: 0.8
      };
    }
  } catch (error) {
    console.log('Database weights error:', error.message);
  }
  
  // Default weights if none available
  return {
    short_interest_weight: 2.0,
    borrow_fee_weight: 1.5,
    volume_weight: 1.2,
    momentum_weight: 1.0,
    catalyst_weight: 0.8,
    float_penalty_weight: 0.8
  };
}

/**
 * Calculate squeeze score using weighted features (with dynamic weights)
 * @param {Object} features Feature data
 * @param {Object} customWeights Optional custom weights to override defaults
 * @returns {number} Squeeze score (0+, rounded to 3 decimals)
 */
function squeezeScore(features, customWeights = null) {
  const {
    short_interest_pct = 0,
    borrow_fee_7d_change = 0,
    rel_volume = 1,
    momentum_5d = 0,
    catalyst_flag = 0,
    float_shares = 50000000
  } = features;
  
  // Get current weights (dynamic or custom)
  const weights = customWeights || getCurrentWeights();
  
  // Normalize and clamp terms to [0,1]
  const shortInterestTerm = Math.min(Math.max(short_interest_pct / 0.5, 0), 1); // Normalize by 50%
  const borrowFeeTerm = Math.min(Math.max((borrow_fee_7d_change + 0.2) / 0.4, 0), 1); // -20% to +20% range
  const volumeTerm = Math.min(Math.max((rel_volume - 1) / 4, 0), 1); // 1x to 5x range
  const momentumTerm = Math.min(Math.max((momentum_5d + 0.2) / 0.4, 0), 1); // -20% to +20% range
  const catalystTerm = catalyst_flag; // Already 0 or 1
  const floatPenalty = Math.min(Math.max((100000000 - float_shares) / 95000000, 0), 1); // Penalty for large float
  
  // Weighted scoring with dynamic coefficients
  const score = 
    weights.short_interest_weight * shortInterestTerm +
    weights.borrow_fee_weight * borrowFeeTerm +
    weights.volume_weight * volumeTerm +
    weights.momentum_weight * momentumTerm +
    weights.catalyst_weight * catalystTerm -
    weights.float_penalty_weight * floatPenalty;
  
  // Ensure non-negative and round to 3 decimals
  return Math.round(Math.max(score, 0) * 1000) / 1000;
}

/**
 * Get human-readable explanation of score components
 * @param {Object} features Feature data
 * @returns {Object} Score breakdown with weights
 */
function explainScore(features) {
  const weights = getCurrentWeights();
  const score = squeezeScore(features);
  
  // Calculate individual contributions
  const {
    short_interest_pct = 0,
    borrow_fee_7d_change = 0,
    rel_volume = 1,
    momentum_5d = 0,
    catalyst_flag = 0,
    float_shares = 50000000
  } = features;
  
  const shortInterestTerm = Math.min(Math.max(short_interest_pct / 0.5, 0), 1);
  const borrowFeeTerm = Math.min(Math.max((borrow_fee_7d_change + 0.2) / 0.4, 0), 1);
  const volumeTerm = Math.min(Math.max((rel_volume - 1) / 4, 0), 1);
  const momentumTerm = Math.min(Math.max((momentum_5d + 0.2) / 0.4, 0), 1);
  const catalystTerm = catalyst_flag;
  const floatPenalty = Math.min(Math.max((100000000 - float_shares) / 95000000, 0), 1);
  
  return {
    total_score: score,
    weights: weights,
    components: {
      short_interest: {
        raw_value: short_interest_pct,
        normalized: shortInterestTerm,
        weight: weights.short_interest_weight,
        contribution: weights.short_interest_weight * shortInterestTerm
      },
      borrow_fee_change: {
        raw_value: borrow_fee_7d_change,
        normalized: borrowFeeTerm,
        weight: weights.borrow_fee_weight,
        contribution: weights.borrow_fee_weight * borrowFeeTerm
      },
      relative_volume: {
        raw_value: rel_volume,
        normalized: volumeTerm,
        weight: weights.volume_weight,
        contribution: weights.volume_weight * volumeTerm
      },
      momentum_5d: {
        raw_value: momentum_5d,
        normalized: momentumTerm,
        weight: weights.momentum_weight,
        contribution: weights.momentum_weight * momentumTerm
      },
      has_catalyst: {
        raw_value: catalyst_flag,
        normalized: catalystTerm,
        weight: weights.catalyst_weight,
        contribution: weights.catalyst_weight * catalystTerm
      },
      float_penalty: {
        raw_value: float_shares,
        normalized: floatPenalty,
        weight: -weights.float_penalty_weight,
        contribution: -weights.float_penalty_weight * floatPenalty
      }
    }
  };
}

/**
 * Calibration helper: Generate training data from historical features and outcomes
 * @param {Array} positions Array of position data with features and outcomes
 * @returns {Array} Training data formatted for calibration endpoint
 */
function generateTrainingData(positions) {
  const trainingData = [];
  
  for (const position of positions) {
    if (position.features && typeof position.outcome_pct === 'number') {
      trainingData.push({
        symbol: position.symbol,
        date: position.date || new Date().toISOString().split('T')[0],
        features: position.features,
        outcome_pct: position.outcome_pct
      });
    }
  }
  
  return trainingData;
}

/**
 * Calibration helper: Test current weights against historical data
 * @param {Array} trainingData Historical data with outcomes
 * @returns {Object} Performance metrics
 */
function testWeights(trainingData) {
  const currentWeights = getCurrentWeights();
  const results = [];
  
  for (const item of trainingData) {
    const predictedScore = squeezeScore(item.features, currentWeights);
    results.push({
      symbol: item.symbol,
      predicted_score: predictedScore,
      actual_outcome: item.outcome_pct,
      accuracy: Math.abs(predictedScore / 5.0 - (item.outcome_pct > 0.1 ? 1 : 0))
    });
  }
  
  const avgAccuracy = results.reduce((sum, r) => sum + (1 - r.accuracy), 0) / results.length;
  const positivePredictions = results.filter(r => r.predicted_score >= 4.0);
  const successRate = positivePredictions.length > 0 ? 
    positivePredictions.filter(r => r.actual_outcome > 0.1).length / positivePredictions.length : 0;
  
  return {
    total_samples: results.length,
    average_accuracy: avgAccuracy,
    positive_predictions: positivePredictions.length,
    success_rate: successRate,
    current_weights: currentWeights,
    detailed_results: results
  };
}

module.exports = {
  squeezeScore,
  explainScore,
  getCurrentWeights,
  generateTrainingData,
  testWeights
};