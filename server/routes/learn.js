/**
 * Learning Hooks API Routes
 * Record user feedback and outcomes for continuous improvement
 */

const express = require('express');
const router = express.Router();

// In-memory storage for now - would be SQLite in production
const feedbackStore = [];
const outcomeStore = [];

/**
 * POST /api/learn/feedback
 * Record user override/feedback
 * 
 * Body: { ticker, action_suggested, action_taken, context? }
 */
router.post('/feedback', async (req, res) => {
  try {
    const { ticker, action_suggested, action_taken, context } = req.body;
    
    console.log(`📚 Learning: Feedback for ${ticker}:`, { action_suggested, action_taken });
    
    // Validate inputs
    if (!ticker || !action_suggested || !action_taken) {
      return res.status(400).json({ 
        error: 'Missing required fields: ticker, action_suggested, action_taken' 
      });
    }
    
    const feedback = {
      id: Date.now(),
      ticker,
      action_suggested,
      action_taken,
      user_override: action_suggested !== action_taken,
      context: context || null,
      timestamp: new Date().toISOString()
    };
    
    feedbackStore.push(feedback);
    
    // TODO: Store in SQLite database
    // INSERT INTO feedback (ticker, action_suggested, action_taken, user_override, context, created_at) VALUES (?, ?, ?, ?, ?, ?)
    
    console.log(`📊 Learning: Recorded ${feedback.user_override ? 'OVERRIDE' : 'AGREEMENT'} for ${ticker}`);
    
    res.json({ 
      success: true,
      message: 'Feedback recorded',
      feedback 
    });
    
  } catch (error) {
    console.error('❌ Learning feedback error:', error.message);
    res.status(500).json({ 
      error: 'Failed to record feedback',
      message: error.message 
    });
  }
});

/**
 * POST /api/learn/outcome
 * Record realized trading outcome
 * 
 * Body: { ticker, action_taken, forward_20m, forward_1h, stop_hit, tp1_hit, tp2_hit }
 */
router.post('/outcome', async (req, res) => {
  try {
    const { 
      ticker, 
      action_taken, 
      forward_20m, 
      forward_1h, 
      stop_hit, 
      tp1_hit, 
      tp2_hit,
      context
    } = req.body;
    
    console.log(`📈 Learning: Outcome for ${ticker}:`, { action_taken, forward_20m, forward_1h });
    
    // Validate inputs
    if (!ticker || !action_taken) {
      return res.status(400).json({ 
        error: 'Missing required fields: ticker, action_taken' 
      });
    }
    
    const outcome = {
      id: Date.now(),
      ticker,
      action_taken,
      forward_20m: forward_20m || null,
      forward_1h: forward_1h || null,
      stop_hit: Boolean(stop_hit),
      tp1_hit: Boolean(tp1_hit),
      tp2_hit: Boolean(tp2_hit),
      context: context || null,
      timestamp: new Date().toISOString()
    };
    
    outcomeStore.push(outcome);
    
    // TODO: Store in SQLite database
    // INSERT INTO outcomes (ticker, action_taken, forward_20m, forward_1h, stop_hit, tp1_hit, tp2_hit, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    
    // Calculate success metrics
    const success = forward_1h > 0 || tp1_hit || tp2_hit;
    console.log(`📊 Learning: ${success ? 'SUCCESS' : 'NEUTRAL/LOSS'} outcome for ${ticker} ${action_taken}`);
    
    res.json({ 
      success: true,
      message: 'Outcome recorded',
      outcome 
    });
    
  } catch (error) {
    console.error('❌ Learning outcome error:', error.message);
    res.status(500).json({ 
      error: 'Failed to record outcome',
      message: error.message 
    });
  }
});

/**
 * GET /api/learn/stats
 * Get learning system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const totalFeedback = feedbackStore.length;
    const totalOutcomes = outcomeStore.length;
    const overrides = feedbackStore.filter(f => f.user_override).length;
    const successfulOutcomes = outcomeStore.filter(o => o.forward_1h > 0 || o.tp1_hit || o.tp2_hit).length;
    
    const stats = {
      feedback: {
        total: totalFeedback,
        overrides,
        agreement_rate: totalFeedback > 0 ? ((totalFeedback - overrides) / totalFeedback * 100).toFixed(1) : '0'
      },
      outcomes: {
        total: totalOutcomes,
        successful: successfulOutcomes,
        success_rate: totalOutcomes > 0 ? (successfulOutcomes / totalOutcomes * 100).toFixed(1) : '0'
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('❌ Learning stats error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get learning stats',
      message: error.message 
    });
  }
});

/**
 * GET /api/learn/feedback
 * Get recent feedback records
 */
router.get('/feedback', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const recent = feedbackStore
      .slice(-limit)
      .reverse(); // Most recent first
    
    res.json(recent);
    
  } catch (error) {
    console.error('❌ Learning feedback get error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get feedback',
      message: error.message 
    });
  }
});

/**
 * GET /api/learn/outcomes
 * Get recent outcome records
 */
router.get('/outcomes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const recent = outcomeStore
      .slice(-limit)
      .reverse(); // Most recent first
    
    res.json(recent);
    
  } catch (error) {
    console.error('❌ Learning outcomes get error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get outcomes',
      message: error.message 
    });
  }
});

module.exports = router;