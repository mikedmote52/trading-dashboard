const express = require('express');
const router = express.Router();
const Engine = require('../services/squeeze/engine');
const db = require('../db/sqlite');

// POST /api/discoveries/run - Run the squeeze engine
router.post('/run', async (req, res) => {
  try {
    const out = await new Engine().run();
    res.json({ success: true, ...out });
  } catch (e) {
    console.error('Engine run error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/discoveries/latest - Get latest discoveries from squeeze engine
router.get('/latest', async (req, res) => {
  try {
    const rows = await db.getLatestDiscoveriesForEngine(50);
    const items = rows.map(r => {
      const f = JSON.parse(r.features_json);
      const a = JSON.parse(r.audit_json);
      return {
        ticker: r.symbol,
        price: r.price,
        composite_score: r.score,
        action: r.action,
        catalyst: f.catalyst,
        technicals: f.technicals,
        short_interest_pct: f.short_interest_pct,
        days_to_cover: f.days_to_cover,
        borrow_fee_pct: f.borrow_fee_pct,
        avg_dollar_liquidity_30d: f.avg_dollar_liquidity_30d,
        entry_hint: { 
          type: f.technicals?.vwap_held_or_reclaimed ? 'vwap_reclaim' : 'base_breakout', 
          trigger_price: f.technicals?.vwap || f.technicals?.price 
        },
        risk: { 
          stop_loss: +(f.technicals?.price * 0.9).toFixed(2), 
          tp1: +(f.technicals?.price * 1.2).toFixed(2), 
          tp2: +(f.technicals?.price * 1.5).toFixed(2) 
        },
        audit: { 
          subscores: a.subscores, 
          weights: a.weights, 
          gates: a.gates, 
          freshness: a.freshness 
        }
      };
    }).filter(x => x.action === 'BUY' || x.action === 'WATCHLIST');
    
    res.json({ success: true, discoveries: items });
  } catch (e) {
    console.error('Latest discoveries error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/discoveries/top - Legacy endpoint for backward compatibility
router.get('/top', async (req, res) => {
  try {
    const rows = await db.getLatestDiscoveriesForEngine(10);
    const items = rows.map(r => {
      const f = JSON.parse(r.features_json);
      return {
        symbol: r.symbol,
        name: r.symbol,
        currentPrice: r.price,
        marketCap: 100000000,
        volumeSpike: f.technicals?.rel_volume || 1.0,
        momentum: 0,
        breakoutStrength: Math.min(r.score / 100, 1.0),
        sector: 'Technology',
        catalysts: f.catalyst?.type ? [f.catalyst.type] : ['Pattern match'],
        similarity: Math.min(r.score / 100, 1.0),
        confidence: Math.min(r.score / 100, 1.0),
        isHighConfidence: r.score >= 75,
        estimatedUpside: r.score >= 75 ? '100-200%' : '50-100%',
        discoveredAt: r.created_at,
        riskLevel: r.score >= 70 ? 'MODERATE' : 'HIGH',
        recommendation: r.action,
        viglScore: Math.min(r.score / 100, 1.0)
      };
    }).filter(r => r.recommendation === 'BUY' || r.recommendation === 'WATCHLIST');
    
    res.json({
      success: true,
      count: items.length,
      discoveries: items
    });
  } catch (error) {
    console.error('Error fetching top discoveries:', error);
    res.json({
      success: false,
      error: error.message,
      discoveries: []
    });
  }
});

// Temporary debug endpoint to show gate drops
router.get('/debug/gates', async (req, res) => {
  try {
    const Engine = require('../services/squeeze/engine');
    const engine = new Engine();
    
    // Get a small universe for debugging
    const universe = ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT'].slice(0, 10);
    const holdings = new Set();
    
    // Run enrichment
    const DS = require('../services/squeeze/data_sources');
    const [shorts, liq, intraday, options, catalysts, sentiment, borrow] = await Promise.all([
      DS.get_short_data(universe),
      DS.get_liquidity(universe),
      DS.get_intraday(universe),
      DS.get_options(universe),
      DS.get_catalysts(universe),
      DS.get_sentiment(universe),
      DS.get_borrow(universe)
    ]);
    
    const enriched = universe.map(tk => ({
      ticker: tk,
      _held: holdings.has && holdings.has(tk),
      ...(shorts[tk]||{}),
      ...(liq[tk]||{}),
      ...(borrow[tk]||{}),
      technicals: intraday[tk]||{},
      options: options[tk]||{},
      catalyst: catalysts[tk]||{},
      sentiment: sentiment[tk]||{}
    }));

    const { passed, drops } = engine.gates.apply(enriched);
    
    // Count drop reasons
    const dropHistogram = {};
    Object.values(drops).forEach(reasons => {
      reasons.forEach(reason => {
        dropHistogram[reason] = (dropHistogram[reason] || 0) + 1;
      });
    });

    res.json({
      universe_size: universe.length,
      passed_count: passed.length,
      dropped_count: Object.keys(drops).length,
      drop_histogram: dropHistogram,
      sample_enriched: enriched[0],
      sample_drops: drops
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

module.exports = router;