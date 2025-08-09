const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getThesis, upsertThesis, insertThesisHistory, getLatestFeatures, insertDecision, getScoringWeights, upsertScoringWeights } = require('../db/sqlite');
const { squeezeScore, explainScore } = require('../services/scoring');

// Mapping from thesis invalidation keys to feature keys
const INVALIDATION_KEY_MAP = {
  borrow_fee_drop: 'borrow_fee_7d_change',
  momentum_rollover: 'momentum_5d',
  rel_volume: 'rel_volume'
};

/**
 * GET /api/portfolio/thesis/:symbol
 * Get thesis for a symbol
 */
router.get('/thesis/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const thesis = getThesis.get(symbol.toUpperCase());
    
    if (!thesis) {
      return res.status(404).json({ error: 'Thesis not found' });
    }
    
    res.json({
      symbol: thesis.symbol,
      thesis: JSON.parse(thesis.thesis_json),
      version: thesis.version,
      updated_at: thesis.updated_at
    });
  } catch (error) {
    console.error('Error getting thesis:', error);
    res.status(500).json({ error: 'Failed to get thesis' });
  }
});

/**
 * GET /api/portfolio/features/latest/:symbol
 * Get latest captured features for a symbol
 */
router.get('/features/latest/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const features = getLatestFeatures.get(symbol.toUpperCase());
    
    if (!features) {
      return res.status(404).json({ error: 'No features found for symbol' });
    }
    
    res.json(features);
  } catch (error) {
    console.error('Error getting latest features:', error);
    res.status(500).json({ error: 'Failed to get latest features' });
  }
});

/**
 * POST /api/portfolio/thesis/:symbol
 * Create or update thesis for a symbol
 */
router.post('/thesis/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const thesisData = req.body;
    
    // Validate required fields
    if (!thesisData.hypothesis) {
      return res.status(400).json({ error: 'Missing required field: hypothesis' });
    }
    
    const upperSymbol = symbol.toUpperCase();
    const now = new Date().toISOString();
    
    // Get existing thesis to archive
    const existing = getThesis.get(upperSymbol);
    if (existing) {
      // Archive to history
      insertThesisHistory.run({
        id: uuidv4(),
        symbol: upperSymbol,
        thesis_json: existing.thesis_json,
        version: existing.version,
        updated_at: existing.updated_at
      });
    }
    
    // Upsert new thesis
    upsertThesis.run({
      id: existing ? existing.id : uuidv4(),
      symbol: upperSymbol,
      thesis_json: JSON.stringify(thesisData),
      updated_at: now
    });
    
    res.json({
      ok: true,
      version: existing ? existing.version + 1 : 1,
      updated_at: now
    });
    
  } catch (error) {
    console.error('Error saving thesis:', error);
    res.status(500).json({ error: 'Failed to save thesis' });
  }
});

/**
 * POST /api/portfolio/decide/:symbol
 * Get AI decision for a symbol based on features
 */
router.post('/decide/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { features } = req.body;
    
    if (!features) {
      return res.status(400).json({ error: 'Missing features in request body' });
    }
    
    const upperSymbol = symbol.toUpperCase();
    
    // Get thesis for validation rules
    const thesisRecord = getThesis.get(upperSymbol);
    let thesis = null;
    if (thesisRecord) {
      thesis = JSON.parse(thesisRecord.thesis_json);
    }
    
    // Calculate squeeze score
    const score = squeezeScore(features);
    
    // Check invalidation rules from thesis
    if (thesis && thesis.invalidation) {
      for (const [rule, condition] of Object.entries(thesis.invalidation)) {
        const featureKey = INVALIDATION_KEY_MAP[rule] || rule;
        const featureValue = features[featureKey];
        if (featureValue !== undefined) {
          const { op, value } = condition;
          let triggered = false;
          
          switch (op) {
            case '<': triggered = featureValue < value; break;
            case '>': triggered = featureValue > value; break;
            case '<=': triggered = featureValue <= value; break;
            case '>=': triggered = featureValue >= value; break;
            case '==': triggered = featureValue == value; break;
            case '!=': triggered = featureValue != value; break;
          }
          
          if (triggered) {
            return res.json({
              action: 'EXIT',
              confidence: 0.9,
              score: score,
              reason: `Invalidation triggered: ${rule}`
            });
          }
        }
      }
    }
    
    // Determine action based on score
    let action, confidence, reason;
    if (score >= 4.0) {
      action = 'ADD';
      confidence = Math.min(score / 5.0, 0.95);
      reason = 'Strong squeeze signals detected';
    } else if (score <= 2.0) {
      action = 'TRIM';
      confidence = Math.min((5.0 - score) / 5.0, 0.9);
      reason = 'Weak signals, reduce risk';
    } else {
      action = 'HOLD';
      confidence = 0.6;
      reason = 'Mixed signals, maintain position';
    }
    
    res.json({
      action,
      confidence: parseFloat(confidence.toFixed(3)),
      score: parseFloat(score.toFixed(3)),
      reason
    });
    
  } catch (error) {
    console.error('Error making decision:', error);
    res.status(500).json({ error: 'Failed to make decision' });
  }
});

/**
 * POST /api/portfolio/propose/:symbol
 * Generate a proposal for a symbol without executing trades
 */
router.post('/propose/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();
    
    // Get latest features for the symbol
    const featuresRecord = getLatestFeatures.get(upperSymbol);
    if (!featuresRecord) {
      return res.status(404).json({ 
        error: 'No features found',
        message: `No recent features available for ${upperSymbol}` 
      });
    }
    
    // Parse features from the JSON
    const features = {
      short_interest_pct: featuresRecord.short_interest_pct,
      borrow_fee_7d_change: featuresRecord.borrow_fee_7d_change,
      rel_volume: featuresRecord.rel_volume,
      momentum_5d: featuresRecord.momentum_5d,
      catalyst_flag: featuresRecord.catalyst_flag,
      float_shares: featuresRecord.float_shares
    };
    
    // Get decision using the decide logic
    const upperSymbolDecision = symbol.toUpperCase();
    
    // Get thesis for validation rules
    const thesisRecord = getThesis.get(upperSymbolDecision);
    let thesis = null;
    if (thesisRecord) {
      thesis = JSON.parse(thesisRecord.thesis_json);
    }
    
    // Calculate squeeze score
    const score = squeezeScore(features);
    const explanation = explainScore(features);
    
    // Check invalidation rules from thesis
    if (thesis && thesis.invalidation) {
      for (const [rule, condition] of Object.entries(thesis.invalidation)) {
        const featureKey = INVALIDATION_KEY_MAP[rule] || rule;
        const featureValue = features[featureKey];
        if (featureValue !== undefined) {
          const { op, value } = condition;
          let triggered = false;
          
          switch (op) {
            case '<': triggered = featureValue < value; break;
            case '>': triggered = featureValue > value; break;
            case '<=': triggered = featureValue <= value; break;
            case '>=': triggered = featureValue >= value; break;
            case '==': triggered = featureValue == value; break;
            case '!=': triggered = featureValue != value; break;
          }
          
          if (triggered) {
            // Create EXIT proposal
            const decisionId = uuidv4();
            insertDecision.run({
              id: decisionId,
              kind: 'proposal',
              symbol: upperSymbol,
              ts: Date.now(),
              policy: JSON.stringify({ invalidation_triggered: rule }),
              features: JSON.stringify(features),
              recommendation: 'EXIT_ALL',
              confidence: 0.9,
              notes: `Proposal: Exit due to invalidation rule ${rule}`
            });
            
            return res.json({
              decision_id: decisionId,
              action: 'EXIT',
              recommendation: 'EXIT_ALL',
              confidence: 0.9,
              score: parseFloat(score.toFixed(3)),
              reason: `Invalidation triggered: ${rule}`,
              explanation,
              proposal: {
                type: 'sell_all',
                message: `Exit entire position due to ${rule} invalidation`,
                urgent: true
              }
            });
          }
        }
      }
    }
    
    // Determine action and proposal based on score
    const decisionId = uuidv4();
    let action, confidence, reason, recommendation, proposal;
    
    if (score >= 4.0) {
      action = 'ADD';
      confidence = Math.min(score / 5.0, 0.95);
      reason = 'Strong squeeze signals detected';
      
      // Get basis points from thesis or use default
      const addBp = thesis?.position_rules?.add_on_strength?.add_bp || 25;
      recommendation = `ADD_${addBp}BP`;
      
      proposal = {
        type: 'buy_more',
        basis_points: addBp,
        dollars: 1000, // Default amount, can be overridden
        message: `Add ${addBp} basis points due to strong signals`,
        urgent: false
      };
      
    } else if (score <= 2.0) {
      action = 'TRIM';
      confidence = Math.min((5.0 - score) / 5.0, 0.9);
      reason = 'Weak signals, reduce risk';
      
      const trimBp = thesis?.position_rules?.trim_on_risk?.trim_bp || 50;
      recommendation = `TRIM_${trimBp}BP`;
      
      proposal = {
        type: 'sell_partial',
        basis_points: trimBp,
        message: `Reduce position by ${trimBp} basis points due to weak signals`,
        urgent: false
      };
      
    } else {
      action = 'HOLD';
      confidence = 0.6;
      reason = 'Mixed signals, maintain position';
      recommendation = 'HOLD';
      
      proposal = {
        type: 'hold',
        message: 'Maintain current position - mixed signals',
        urgent: false
      };
    }
    
    // Record the proposal decision (but don't execute trade)
    insertDecision.run({
      id: decisionId,
      kind: 'proposal',
      symbol: upperSymbol,
      ts: Date.now(),
      policy: JSON.stringify({ score_threshold: score >= 4.0 ? 'high' : score <= 2.0 ? 'low' : 'mixed' }),
      features: JSON.stringify(features),
      recommendation,
      confidence,
      notes: `Proposal: ${action} - ${reason}`
    });
    
    res.json({
      decision_id: decisionId,
      action,
      recommendation,
      confidence: parseFloat(confidence.toFixed(3)),
      score: parseFloat(score.toFixed(3)),
      reason,
      explanation,
      proposal
    });
    
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ 
      error: 'Failed to create proposal',
      message: error.message 
    });
  }
});

/**
 * GET /api/portfolio/decide/latest/:symbol
 * Get latest AI decision for a symbol based on most recent features
 */
router.get('/decide/latest/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();
    
    // Get latest features for the symbol
    const featuresRecord = getLatestFeatures.get(upperSymbol);
    if (!featuresRecord) {
      return res.status(404).json({ 
        error: 'No features found',
        message: `No recent features available for ${upperSymbol}` 
      });
    }
    
    // Parse features from the database record
    const features = {
      short_interest_pct: featuresRecord.short_interest_pct,
      borrow_fee_7d_change: featuresRecord.borrow_fee_7d_change,
      rel_volume: featuresRecord.rel_volume,
      momentum_5d: featuresRecord.momentum_5d,
      catalyst_flag: featuresRecord.catalyst_flag,
      float_shares: featuresRecord.float_shares
    };
    
    // Get thesis for validation rules
    const thesisRecord = getThesis.get(upperSymbol);
    let thesis = null;
    if (thesisRecord) {
      thesis = JSON.parse(thesisRecord.thesis_json);
    }
    
    // Calculate squeeze score
    const score = squeezeScore(features);
    const explanation = explainScore(features);
    
    // Check invalidation rules from thesis
    if (thesis && thesis.invalidation) {
      for (const [rule, condition] of Object.entries(thesis.invalidation)) {
        const featureKey = INVALIDATION_KEY_MAP[rule] || rule;
        const featureValue = features[featureKey];
        if (featureValue !== undefined) {
          const { op, value } = condition;
          let triggered = false;
          
          switch (op) {
            case '<': triggered = featureValue < value; break;
            case '>': triggered = featureValue > value; break;
            case '<=': triggered = featureValue <= value; break;
            case '>=': triggered = featureValue >= value; break;
            case '==': triggered = featureValue == value; break;
            case '!=': triggered = featureValue != value; break;
          }
          
          if (triggered) {
            return res.json({
              action: 'EXIT',
              confidence: 0.9,
              score: parseFloat(score.toFixed(3)),
              reason: `Invalidation triggered: ${rule}`,
              explanation,
              features_timestamp: featuresRecord.created_at
            });
          }
        }
      }
    }
    
    // Determine action based on score
    let action, confidence, reason;
    if (score >= 4.0) {
      action = 'ADD';
      confidence = Math.min(score / 5.0, 0.95);
      reason = 'Strong squeeze signals detected';
    } else if (score <= 2.0) {
      action = 'TRIM';
      confidence = Math.min((5.0 - score) / 5.0, 0.9);
      reason = 'Weak signals, reduce risk';
    } else {
      action = 'HOLD';
      confidence = 0.6;
      reason = 'Mixed signals, maintain position';
    }
    
    res.json({
      action,
      confidence: parseFloat(confidence.toFixed(3)),
      score: parseFloat(score.toFixed(3)),
      reason,
      explanation,
      features_timestamp: featuresRecord.created_at
    });
    
  } catch (error) {
    console.error('Error getting latest decision:', error);
    res.status(500).json({ error: 'Failed to get latest decision' });
  }
});

/**
 * POST /api/portfolio/calibrate
 * Calibrate scoring weights based on historical outcomes
 */
router.post('/calibrate', async (req, res) => {
  try {
    const { training_data } = req.body;
    
    if (!Array.isArray(training_data) || training_data.length === 0) {
      return res.status(400).json({ 
        error: 'Missing or empty training_data array' 
      });
    }
    
    // Validate training data format
    for (const item of training_data) {
      if (!item.symbol || !item.features || typeof item.outcome_pct !== 'number') {
        return res.status(400).json({ 
          error: 'Invalid training data format',
          expected: '{ symbol, date, features, outcome_pct }[]'
        });
      }
    }
    
    console.log(`🧠 Calibrating scoring weights with ${training_data.length} data points`);
    
    // Simple weight optimization (gradient-free approach)
    const winners = training_data.filter(d => d.outcome_pct > 0.10); // >10% return
    const losers = training_data.filter(d => d.outcome_pct < -0.05); // <-5% return
    
    console.log(`📊 Winners: ${winners.length}, Losers: ${losers.length}`);
    
    if (winners.length === 0 && losers.length === 0) {
      return res.status(400).json({ 
        error: 'No clear winners or losers in training data' 
      });
    }
    
    // Calculate feature importance by correlation with outcomes
    const featureNames = ['short_interest_pct', 'borrow_fee_7d_change', 'rel_volume', 'momentum_5d', 'catalyst_flag'];
    const correlations = {};
    
    featureNames.forEach(feature => {
      const featureValues = training_data.map(d => d.features[feature] || 0);
      const outcomes = training_data.map(d => d.outcome_pct);
      correlations[feature] = calculateCorrelation(featureValues, outcomes);
    });
    
    // Convert correlations to weights (positive correlations get higher weights)
    const newWeights = {
      short_interest_weight: Math.max(0.5, 2.0 + correlations.short_interest_pct * 2),
      borrow_fee_weight: Math.max(0.5, 1.5 + correlations.borrow_fee_7d_change * 2),
      volume_weight: Math.max(0.5, 1.2 + correlations.rel_volume * 2),
      momentum_weight: Math.max(0.5, 1.0 + correlations.momentum_5d * 2),
      catalyst_weight: Math.max(0.3, 0.8 + correlations.catalyst_flag * 1),
      float_penalty_weight: 0.8 // Keep static for now
    };
    
    // Store the new weights
    const version = Date.now(); // Use timestamp as version
    upsertScoringWeights.run({
      version,
      weights_json: JSON.stringify(newWeights),
      updated_at: new Date().toISOString()
    });
    
    console.log(`✅ Updated scoring weights:`, newWeights);
    
    res.json({
      success: true,
      version,
      training_samples: training_data.length,
      winners: winners.length,
      losers: losers.length,
      correlations,
      weights: newWeights,
      message: 'Scoring weights calibrated successfully'
    });
    
  } catch (error) {
    console.error('Error calibrating weights:', error);
    res.status(500).json({ 
      error: 'Failed to calibrate weights',
      message: error.message 
    });
  }
});

/**
 * Simple correlation calculation
 */
function calculateCorrelation(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  
  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;
  
  let numerator = 0;
  let sumXSq = 0;
  let sumYSq = 0;
  
  for (let i = 0; i < n; i++) {
    const deltaX = x[i] - meanX;
    const deltaY = y[i] - meanY;
    numerator += deltaX * deltaY;
    sumXSq += deltaX * deltaX;
    sumYSq += deltaY * deltaY;
  }
  
  const denominator = Math.sqrt(sumXSq * sumYSq);
  return denominator === 0 ? 0 : numerator / denominator;
}

module.exports = router;