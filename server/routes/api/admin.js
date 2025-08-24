const express = require('express');
const { getDb } = require('../../lib/db');

const router = express.Router();

// Middleware for admin auth
function requireAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN || 'admin123';
  if (req.headers['x-admin-token'] !== adminToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Populate database with sample data
router.post('/populate', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    await db.initialize();
    
    // Sample contenders
    const contenders = [
      { ticker: 'NVDA', price: 475.20, score: 88, action: 'BUY', confidence: 88, 
        thesis: 'AI leader with strong momentum. High volatility, VWAP reclaim signals entry.', 
        engine: 'vigl_discovery', 
        subscores: { momentum: 85, technical: 80, volume: 75 }, 
        reasons: ['High volatility', 'VWAP reclaim', 'Volume surge'] },
      
      { ticker: 'TSLA', price: 245.50, score: 82, action: 'EARLY_READY', confidence: 82,
        thesis: 'EV momentum play. Breaking resistance with volume confirmation.',
        engine: 'vigl_discovery',
        subscores: { momentum: 75, technical: 80, volume: 70 },
        reasons: ['Breakout pattern', 'Volume spike', 'Momentum building'] },
      
      { ticker: 'AMD', price: 168.30, score: 78, action: 'EARLY_READY', confidence: 78,
        thesis: 'Semiconductor play following NVDA. Technical setup improving.',
        engine: 'vigl_discovery',
        subscores: { momentum: 75, technical: 75, volume: 65 },
        reasons: ['Sector momentum', 'Technical setup', 'Volume increasing'] },
      
      { ticker: 'PLTR', price: 158.90, score: 75, action: 'EARLY_READY', confidence: 75,
        thesis: 'Data analytics leader. Government contracts driving growth.',
        engine: 'vigl_discovery',
        subscores: { momentum: 70, technical: 75, volume: 60 },
        reasons: ['Contract wins', 'Technical breakout', 'Institutional buying'] }
    ];

    // Clear and insert contenders
    await db.run('DELETE FROM contenders');
    
    let contenderCount = 0;
    for (const c of contenders) {
      await db.run(`
        INSERT INTO contenders (
          ticker, price, score, action, confidence, thesis,
          engine, run_id, snapshot_ts, subscores, reasons, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        c.ticker, c.price, c.score, c.action, c.confidence, c.thesis,
        c.engine, 'admin_populate', new Date().toISOString(), 
        c.subscores, c.reasons
      ]);
      contenderCount++;
    }

    // Generate decisions for high scorers
    await db.run('DELETE FROM decisions');
    
    let decisionCount = 0;
    for (const c of contenders.filter(x => x.score >= 75)) {
      const entry = c.price;
      const stop = entry * 0.90;
      const tp1 = entry * 1.20;
      const tp2 = entry * 1.50;
      
      const sizePlan = {
        initial: 100,
        scale_in: [50, 100, 150],
        max_exposure: 500
      };
      
      const rationale = {
        score: c.score,
        thesis: c.thesis,
        reasons: c.reasons,
        subscores: c.subscores
      };
      
      await db.run(`
        INSERT INTO decisions (
          ticker, action, score, confidence, thesis,
          entry_price, stop_price, tp1_price, tp2_price,
          size_plan, rationale, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        c.ticker, 'BUY CANDIDATE', c.score, c.confidence, c.thesis,
        entry, stop, tp1, tp2, sizePlan, rationale
      ]);
      decisionCount++;
    }

    res.json({
      success: true,
      message: `Populated ${contenderCount} contenders and ${decisionCount} decisions`,
      contenders: contenderCount,
      decisions: decisionCount
    });
    
  } catch (err) {
    console.error('Admin populate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Clear all data
router.post('/clear', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    await db.initialize();
    
    await db.run('DELETE FROM contenders');
    await db.run('DELETE FROM decisions');
    await db.run('DELETE FROM discoveries');
    
    res.json({
      success: true,
      message: 'All data cleared'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;