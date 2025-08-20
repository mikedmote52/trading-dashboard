/**
 * Unified Engine API Routes
 * Single endpoint for both AlphaStack and LPI v2 UIs
 */

const express = require('express');
const router = express.Router();
const { advise } = require('../lib/advise');

/**
 * POST /api/engine/advise
 * Unified advice endpoint for all UIs
 * 
 * Body: {
 *   scores: [{ ticker, score, intraday: { rvol, vwap_reclaimed, ema9_over_20 } }],
 *   positions: [{ ticker, shares, unrealized_pnl_pct, exposure_usd }],
 *   thesis: { [ticker]: { trend: 'Strengthening|Stable|Weakening|Broken' } }
 * }
 */
router.post('/advise', async (req, res) => {
  try {
    const { scores = [], positions = [], thesis = {} } = req.body || {};
    
    console.log(`🔧 Engine /advise: ${scores.length} scores, ${positions.length} positions`);
    
    // Call unified advice engine
    const actions = await advise({ 
      scores, 
      positions, 
      thesisMap: thesis 
    });
    
    res.json(actions);
    
  } catch (error) {
    console.error('❌ Engine /advise error:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate advice',
      message: error.message 
    });
  }
});

/**
 * GET /api/engine/health
 * Health check for unified engine
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    engine: 'unified',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;