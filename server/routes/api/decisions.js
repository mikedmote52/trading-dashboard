const express = require('express');
const { getLatestDecisions } = require('../../workers/decisions_generator');

const router = express.Router();

// Get latest trading decisions
router.get('/latest', getLatestDecisions);

// Get decision by symbol
router.get('/symbol/:symbol', async (req, res) => {
  const { getDb } = require('../../lib/db');
  
  try {
    const db = getDb();
    await db.initialize();
    
    const decision = await db.get(`
      SELECT * FROM decisions 
      WHERE symbol = $1 
      AND status IN ('planned', 'executed')
      ORDER BY created_at DESC
      LIMIT 1
    `, [req.params.symbol]);
    
    if (!decision) {
      return res.status(404).json({ error: 'No decision found for symbol' });
    }
    
    // Parse JSON fields
    if (typeof decision.size_plan === 'string') {
      decision.size_plan = JSON.parse(decision.size_plan);
    }
    if (typeof decision.rationale === 'string') {
      decision.rationale = JSON.parse(decision.rationale);
    }
    
    res.json(decision);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;