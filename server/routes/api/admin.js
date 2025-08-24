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

// no-token generator (single user)
router.post('/decisions/generate', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false } });
    // handle symbol vs ticker
    const { rows: cands } = await pool.query(`
      select
        coalesce(ticker, symbol, '') as tkr,
        price, vwap, score_composite,
        ema9, ema20, rsi, atr_pct,
        iv_percentile, call_put_ratio,
        float_shares, short_interest_pct, borrow_fee_pct, utilization_pct,
        catalyst, sentiment_score
      from contenders
      where score_composite >= 0   -- lower for initial testing; raise to 75 later
      and   created_at > now() - interval '7 days'
      order by score_composite desc
      limit 100
    `);
    let inserted = 0;
    for (const c of cands) {
      const entry = c.vwap ?? c.price;
      const stop  = entry ? Number(entry)*0.90 : null;
      const tp1   = entry ? Number(entry)*1.20 : null;
      const tp2   = entry ? Number(entry)*1.50 : null;
      await pool.query(`
        insert into decisions (ticker, action, entry, stop, tp1, tp2, size_plan, rationale, score_composite, created_at)
        values ($1,'BUY CANDIDATE',$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8, now())
        on conflict do nothing
      `, [
        c.tkr, entry, stop, tp1, tp2,
        JSON.stringify({ initial:100, scale:[50,150], cap:500 }),
        JSON.stringify({
          catalyst:c.catalyst,
          options:{ iv_percentile:c.iv_percentile, call_put_ratio:c.call_put_ratio },
          short:{ float:c.float_shares, si_pct:c.short_interest_pct, borrow_fee:c.borrow_fee_pct, util:c.utilization_pct },
          tech:{ ema9:c.ema9, ema20:c.ema20, rsi:c.rsi, atr_pct:c.atr_pct, vwap:c.vwap }
        }),
        c.score_composite
      ]);
      inserted++;
    }
    res.json({ ok: true, inserted });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// seed some PG contenders for immediate UI testing
router.post('/seed/contenders', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false } });
    const sample = [
      { tkr:'SEED1', price:11.1, vwap:11.0, rvol:3.2, score:80, rsi:62, ema9:11.0, ema20:10.8, atr:4.5 },
      { tkr:'SEED2', price:22.5, vwap:22.3, rvol:4.0, score:85, rsi:65, ema9:22.2, ema20:21.9, atr:5.2 }
    ];
    let inserted=0;
    for (const c of sample) {
      await pool.query(`
        insert into contenders (ticker, price, vwap, rvol, score_composite, rsi, ema9, ema20, atr_pct, created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
        on conflict do nothing
      `,[c.tkr,c.price,c.vwap,c.rvol,c.score,c.rsi,c.ema9,c.ema20,c.atr]);
      inserted++;
    }
    res.json({ ok:true, inserted });
  } catch(e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

module.exports = router;