/**
 * TP/SL Rules API Routes
 * Per-ticker take profit and stop loss settings
 */

const express = require('express');
const router = express.Router();

// In-memory storage for now - would be SQLite in production
const rulesStore = new Map();

/**
 * PUT /api/portfolio/rules/:ticker
 * Save TP/SL rules for a specific ticker
 * 
 * Body: { tp1_pct, tp2_pct, stop_pct }
 */
router.put('/rules/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { tp1_pct, tp2_pct, stop_pct } = req.body;
    
    console.log(`⚙️ Rules: Saving for ${ticker}:`, { tp1_pct, tp2_pct, stop_pct });
    
    // Validate inputs
    if (typeof tp1_pct !== 'number' || tp1_pct <= 0 || tp1_pct > 1) {
      return res.status(400).json({ error: 'tp1_pct must be a number between 0 and 1' });
    }
    if (typeof tp2_pct !== 'number' || tp2_pct <= 0 || tp2_pct > 2) {
      return res.status(400).json({ error: 'tp2_pct must be a number between 0 and 2' });
    }
    if (typeof stop_pct !== 'number' || stop_pct <= 0 || stop_pct > 0.5) {
      return res.status(400).json({ error: 'stop_pct must be a number between 0 and 0.5' });
    }
    
    // Store rules
    const rules = {
      ticker,
      tp1_pct: parseFloat(tp1_pct),
      tp2_pct: parseFloat(tp2_pct),
      stop_pct: parseFloat(stop_pct),
      updated_at: new Date().toISOString()
    };
    
    rulesStore.set(ticker, rules);
    
    // TODO: Persist to SQLite database
    // INSERT OR REPLACE INTO ticker_rules (ticker, tp1_pct, tp2_pct, stop_pct, updated_at) VALUES (?, ?, ?, ?, ?)
    
    res.json({ 
      ok: true,
      message: `Rules saved for ${ticker}`,
      rules 
    });
    
  } catch (error) {
    console.error(`❌ Rules error for ${ticker}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to save rules',
      message: error.message 
    });
  }
});

/**
 * GET /api/portfolio/rules/:ticker
 * Get TP/SL rules for a specific ticker
 */
router.get('/rules/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    
    // Get stored rules or return defaults
    const storedRules = rulesStore.get(ticker);
    const rules = storedRules || {
      ticker,
      tp1_pct: 0.15,  // Default 15%
      tp2_pct: 0.50,  // Default 50%
      stop_pct: 0.10, // Default 10%
      updated_at: null
    };
    
    console.log(`📊 Rules: Retrieved for ${ticker}:`, rules);
    res.json(rules);
    
  } catch (error) {
    console.error(`❌ Rules get error for ${ticker}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to get rules',
      message: error.message 
    });
  }
});

/**
 * GET /api/portfolio/rules
 * Get all TP/SL rules
 */
router.get('/rules', async (req, res) => {
  try {
    const allRules = Object.fromEntries(rulesStore.entries());
    res.json(allRules);
    
  } catch (error) {
    console.error('❌ Rules get all error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get all rules',
      message: error.message 
    });
  }
});

module.exports = router;