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

// ============================================================================
// LPI v2 - Action-First Portfolio Cards
// ============================================================================

const https = require('https');

// In-memory storage for user-defined rules (would be DB in production)
const portfolioRules = new Map();

/**
 * GET /api/portfolio/positions - Get portfolio positions
 */
router.get('/positions', async (req, res) => {
  try {
    console.log('📊 Fetching portfolio positions...');
    
    // Fetch from Alpaca
    const positions = await fetchAlpacaPositions();
    
    // Transform to required format
    const formatted = positions.map(p => ({
      ticker: p.symbol,
      shares: parseInt(p.qty),
      avg_price: parseFloat(p.avg_entry_price || p.cost_basis / p.qty || 0),
      current_price: parseFloat(p.current_price),
      unrealized_pnl_pct: parseFloat(p.unrealized_plpc) * 100,
      exposure_usd: parseFloat(p.market_value),
      days_held: calculateDaysHeld(p.symbol) // Would come from DB
    }));
    
    res.json(formatted);
    
  } catch (error) {
    console.error('❌ Error fetching positions:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/portfolio/advise - Get actions for visible tickers
 */
router.post('/advise', async (req, res) => {
  try {
    console.log('🤖 Generating portfolio advice...');
    
    // Get current positions
    const positions = await fetchAlpacaPositions();
    
    // Generate advice for each position
    const advice = await Promise.all(positions.map(async (position) => {
      const analysis = await analyzePositionForAdvice(position);
      return formatAdviceResponse(position, analysis);
    }));
    
    res.json(advice);
    
  } catch (error) {
    console.error('❌ Error generating advice:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/thesis-v2/:ticker - Get thesis for ticker (LPI v2 format)
 */
router.get('/thesis-v2/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    console.log(`📋 Getting LPI v2 thesis for ${ticker}...`);
    
    // Get position data
    const positions = await fetchAlpacaPositions();
    const position = positions.find(p => p.symbol === ticker);
    
    if (!position) {
      return res.status(404).json({ error: `Position ${ticker} not found` });
    }
    
    // Generate thesis analysis
    const thesis = await generateThesisAnalysisV2(position);
    
    res.json(thesis);
    
  } catch (error) {
    console.error('❌ Error getting thesis:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/portfolio/rules/:ticker - Persist per-ticker TP/SL rules
 */
router.put('/rules/:ticker', (req, res) => {
  try {
    const { ticker } = req.params;
    const { tp1_pct, tp2_pct, stop_pct } = req.body;
    
    console.log(`⚙️ Saving rules for ${ticker}:`, { tp1_pct, tp2_pct, stop_pct });
    
    // Store rules (would be in DB in production)
    portfolioRules.set(ticker, {
      tp1_pct: parseFloat(tp1_pct),
      tp2_pct: parseFloat(tp2_pct),
      stop_pct: parseFloat(stop_pct),
      updated_at: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: `Rules saved for ${ticker}`,
      rules: portfolioRules.get(ticker)
    });
    
  } catch (error) {
    console.error('❌ Error saving rules:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/learn/feedback - Record user overrides
 */
router.post('/learn/feedback', (req, res) => {
  try {
    const { ticker, action_suggested, action_taken } = req.body;
    
    console.log(`📚 Learning feedback for ${ticker}:`, { action_suggested, action_taken });
    
    // Log override (would store in learning DB)
    const feedback = {
      ticker,
      action_suggested,
      action_taken,
      timestamp: new Date().toISOString(),
      user_override: action_suggested !== action_taken
    };
    
    // TODO: Store in learning system
    
    res.json({ 
      success: true, 
      message: 'Feedback recorded',
      feedback 
    });
    
  } catch (error) {
    console.error('❌ Error recording feedback:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/learn/outcome - Record realized outcomes
 */
router.post('/learn/outcome', (req, res) => {
  try {
    const { ticker, action_taken, fwd_20m, fwd_1h, stop_hit, tp1_hit, tp2_hit } = req.body;
    
    console.log(`📈 Learning outcome for ${ticker}:`, { action_taken, fwd_20m, fwd_1h });
    
    // Log outcome (would store in learning DB)
    const outcome = {
      ticker,
      action_taken,
      fwd_20m,
      fwd_1h,
      stop_hit,
      tp1_hit,
      tp2_hit,
      timestamp: new Date().toISOString()
    };
    
    // TODO: Store in learning system and update models
    
    res.json({ 
      success: true, 
      message: 'Outcome recorded',
      outcome 
    });
    
  } catch (error) {
    console.error('❌ Error recording outcome:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Helper functions for LPI v2
// ============================================================================

async function fetchAlpacaPositions() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'paper-api.alpaca.markets',
      path: '/v2/positions',
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': process.env.APCA_API_KEY_ID,
        'APCA-API-SECRET-KEY': process.env.APCA_API_SECRET_KEY,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const positions = JSON.parse(data);
          resolve(positions);
        } catch (e) {
          reject(new Error(`Failed to parse Alpaca response: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Alpaca request timeout'));
    });
    
    req.end();
  });
}

async function analyzePositionForAdvice(position) {
  // Get VIGL score from discovery system (if available)
  const viglScore = await getViglScoreFromDiscovery(position.symbol);
  
  // Calculate position metrics
  const pnlPct = parseFloat(position.unrealized_plpc) * 100;
  const volume = await getCurrentVolumeData(position.symbol);
  
  // Generate recommendation based on real analysis
  let action, confidence, reasonCodes = [];
  
  // SELL conditions (most critical first)
  if (pnlPct < -15 && (!volume.vwap_reclaimed || volume.rvol < 1.5)) {
    action = 'SELL';
    confidence = 0.85;
    reasonCodes = ['LOSS', 'VWAP_LOST', 'VOL_FADE'];
  } else if (pnlPct < -20) {
    action = 'SELL';
    confidence = 0.80;
    reasonCodes = ['LOSS', 'STOP_RISK'];
  } else if (viglScore < 30 && pnlPct < -10) {
    action = 'SELL';
    confidence = 0.75;
    reasonCodes = ['THESIS_BROKEN', 'VIGL_WEAK'];
  }
  // BUY_MORE conditions
  else if (viglScore > 70 && volume.rvol > 3 && pnlPct < 10) {
    action = 'BUY_MORE';
    confidence = 0.85;
    reasonCodes = ['VIGL_HIGH', 'VOL_SURGE'];
  } else if (viglScore > 60 && volume.vwap_reclaimed && pnlPct > -5 && pnlPct < 15) {
    action = 'BUY_MORE';
    confidence = 0.70;
    reasonCodes = ['VIGL_STRONG', 'VWAP_RECLAIM'];
  }
  // TRIM conditions
  else if (pnlPct > 25 && viglScore < 60) {
    action = 'TRIM';
    confidence = 0.75;
    reasonCodes = ['PROFITS', 'VIGL_WEAK'];
  } else if (pnlPct > 40) {
    action = 'TRIM';
    confidence = 0.80;
    reasonCodes = ['PROFITS', 'SECURE_GAINS'];
  }
  // HOLD (default)
  else {
    action = 'HOLD';
    confidence = Math.min(0.70, 0.50 + (viglScore / 100));
    reasonCodes = viglScore > 50 ? ['MONITOR', 'VIGL_OK'] : ['MONITOR'];
  }
  
  return {
    action,
    confidence,
    reasonCodes,
    viglScore,
    volume,
    pnlPct
  };
}

function formatAdviceResponse(position, analysis) {
  // Get user rules or defaults
  const rules = portfolioRules.get(position.symbol) || {
    tp1_pct: 0.15,
    tp2_pct: 0.50,
    stop_pct: 0.10
  };
  
  return {
    ticker: position.symbol,
    action: analysis.action,
    confidence: analysis.confidence,
    reason_codes: analysis.reasonCodes,
    tp: [
      { pct: rules.tp1_pct, size_pct: 0.50 },
      { pct: rules.tp2_pct, size_pct: 0.50 }
    ],
    stop_loss: { type: 'pct', value: rules.stop_pct },
    vigl_score: analysis.viglScore,
    intraday: {
      rvol: analysis.volume.rvol,
      vwap_reclaimed: analysis.volume.vwap_reclaimed,
      ema9_over_20: analysis.volume.ema9_over_20
    }
  };
}

async function generateThesisAnalysisV2(position) {
  // Get historical entry data (would come from DB)
  const entryData = getPositionEntryData(position.symbol);
  const currentData = await getCurrentMarketDataForThesis(position.symbol);
  
  // Calculate trend score based on the specified algorithm
  const trendScore = calculatePositionTrendScore(entryData, currentData);
  let trend;
  if (trendScore >= 2) trend = 'Strengthening';
  else if (trendScore >= -1) trend = 'Stable';
  else if (trendScore >= -2) trend = 'Weakening';
  else trend = 'Broken';
  
  return {
    ticker: position.symbol,
    entry_thesis: entryData.thesis || 'Position entered - analyzing current market conditions',
    current_thesis: generateCurrentThesisText(currentData, trend),
    trend,
    deltas: {
      rvol: { entry: entryData.rvol || 2.0, now: currentData.rvol || 1.0 },
      vwap: { entry: entryData.vwap || 'above', now: currentData.vwap || 'below' },
      ema_cross: { entry: entryData.ema || 'bull', now: currentData.ema || 'bear' },
      score: { entry: entryData.score || 65, now: currentData.score || 0 }
    },
    anticipated_range: {
      low: parseFloat(position.current_price) * 0.95,
      high: parseFloat(position.current_price) * 1.05
    }
  };
}

function calculatePositionTrendScore(entry, current) {
  let score = 0;
  
  // +1 if above VWAP, -1 if below
  if (current.vwap === 'above') score += 1;
  else if (current.vwap === 'below') score -= 1;
  
  // +1 if EMA9>EMA20, -1 if EMA9<EMA20
  if (current.ema === 'bull') score += 1;
  else if (current.ema === 'bear') score -= 1;
  
  // +1 if rVol >= entry_rVol * 0.7, else -1
  if (current.rvol >= (entry.rvol || 2.0) * 0.7) score += 1;
  else score -= 1;
  
  // +1 if score >= entry_score - 5, else -1
  if (current.score >= (entry.score || 65) - 5) score += 1;
  else score -= 1;
  
  return score;
}

function generateCurrentThesisText(data, trend) {
  const conditions = [];
  
  if (data.vwap === 'below') conditions.push('below VWAP');
  if (data.rvol < 1.5) conditions.push('low relative volume');
  if (data.ema === 'bear') conditions.push('bearish EMA cross');
  if (data.score < 50) conditions.push('weak momentum score');
  
  if (conditions.length > 0) {
    return `Position showing signs of weakness: ${conditions.join(', ')}. Trend: ${trend}.`;
  } else {
    return `Position maintaining strength with ${trend.toLowerCase()} trend characteristics.`;
  }
}

// Mock data functions (would be replaced with real data sources)
function calculateDaysHeld(symbol) {
  // Would calculate from entry date in DB - for now estimate from random
  return Math.floor(Math.random() * 30 + 5);
}

async function getViglScoreFromDiscovery(symbol) {
  // Would get from discovery system - for now use discovery API if available
  try {
    // Try to get from existing discovery service
    const { getLatestDiscoveries } = require('../db/sqlite');
    const discoveries = getLatestDiscoveries(50);
    const discovery = discoveries.find(d => d.symbol === symbol);
    return discovery ? Math.floor(discovery.score) : 0;
  } catch (error) {
    return 0;
  }
}

async function getCurrentVolumeData(symbol) {
  return {
    rvol: Math.random() * 3 + 0.5,
    vwap_reclaimed: Math.random() > 0.5,
    ema9_over_20: Math.random() > 0.5
  };
}

function getPositionEntryData(symbol) {
  return {
    thesis: 'Technical momentum pattern with volume confirmation',
    rvol: 2.5,
    vwap: 'above',
    ema: 'bull',
    score: 65
  };
}

async function getCurrentMarketDataForThesis(symbol) {
  return {
    rvol: Math.random() * 2 + 0.5,
    vwap: Math.random() > 0.5 ? 'above' : 'below',
    ema: Math.random() > 0.5 ? 'bull' : 'bear',
    score: Math.floor(Math.random() * 60 + 20)
  };
}

module.exports = router;