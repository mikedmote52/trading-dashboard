const express = require('express');
const router = express.Router();

// Populate Postgres with sample data
router.post('/run', async (req, res) => {
  try {
    console.log('🚀 Population API called');
    
    const { getDb } = require('../../lib/db');
    const db = getDb();
    await db.initialize();
    
    if (db.getType() !== 'postgres') {
      return res.status(400).json({
        error: 'Wrong database type',
        type: db.getType(),
        message: 'Population can only run with Postgres database'
      });
    }

    console.log('📊 Populating Postgres with sample data...');

    // Add sample contenders (high scoring candidates for decisions generator)
    const contenders = [
      { symbol: 'NVDA', score: 87.5, price: 450.50, volume_ratio: 4.2, short_interest: 15.2, borrow_fee: 2.8 },
      { symbol: 'TSLA', score: 82.1, price: 240.30, volume_ratio: 3.8, short_interest: 12.5, borrow_fee: 3.1 },
      { symbol: 'AMD', score: 79.8, price: 145.20, volume_ratio: 5.1, short_interest: 18.6, borrow_fee: 2.5 },
      { symbol: 'MSTR', score: 84.2, price: 358.13, volume_ratio: 2.9, short_interest: 8.3, borrow_fee: 4.2 },
      { symbol: 'PLTR', score: 76.5, price: 158.74, volume_ratio: 2.1, short_interest: 22.1, borrow_fee: 1.8 }
    ];

    let addedContenders = 0;
    for (const contender of contenders) {
      const existing = await db.get('SELECT id FROM contenders WHERE symbol = ?', [contender.symbol]);
      
      if (!existing) {
        await db.run(`
          INSERT INTO contenders (
            symbol, score, price, volume_ratio, short_interest, borrow_fee,
            thesis, catalyst, entry_point, stop_loss, target_1, target_2,
            status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          contender.symbol,
          contender.score,
          contender.price,
          contender.volume_ratio,
          contender.short_interest,
          contender.borrow_fee,
          'High momentum with squeeze potential based on technical analysis',
          'Earnings momentum and institutional buying',
          contender.price,
          contender.price * 0.90,
          contender.price * 1.25,
          contender.price * 1.60,
          'active'
        ]);
        addedContenders++;
      }
    }

    // Add sample discoveries
    const discoveries = [
      { symbol: 'NVDA', score: 87.5, latest_price: 450.50, source: 'universe_screener' },
      { symbol: 'TSLA', score: 82.1, latest_price: 240.30, source: 'universe_screener' },
      { symbol: 'AMD', score: 79.8, latest_price: 145.20, source: 'universe_screener' },
      { symbol: 'CRWD', score: 74.2, latest_price: 420.55, source: 'universe_screener' },
      { symbol: 'SHOP', score: 71.8, latest_price: 142.11, source: 'universe_screener' }
    ];

    let addedDiscoveries = 0;
    for (const discovery of discoveries) {
      const existing = await db.get('SELECT id FROM discoveries WHERE symbol = ? AND source = ?', [discovery.symbol, discovery.source]);
      
      if (!existing) {
        await db.run(`
          INSERT INTO discoveries (
            symbol, score, latest_price, volume_ratio, short_interest, borrow_fee,
            thesis, catalyst, risk_level, entry_point, stop_loss, target_1, target_2,
            source, discovered_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          discovery.symbol,
          discovery.score,
          discovery.latest_price,
          2.5, // volume_ratio
          15.0, // short_interest
          2.5, // borrow_fee
          'Strong technical setup with momentum',
          'Market conditions favorable',
          'medium',
          discovery.latest_price,
          discovery.latest_price * 0.92,
          discovery.latest_price * 1.20,
          discovery.latest_price * 1.50,
          discovery.source
        ]);
        addedDiscoveries++;
      }
    }

    // Add sample outcome
    const existing_outcome = await db.get('SELECT id FROM outcomes WHERE symbol = ?', ['VIGL']);
    let addedOutcomes = 0;
    
    if (!existing_outcome) {
      // Use simple date values
      await db.run(`
        INSERT INTO outcomes (
          symbol, entry_price, exit_price, return_pct, outcome, created_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, ['VIGL', 3.45, 18.12, 425.2, 'win']);
      addedOutcomes++;
    }

    // Get final counts
    const finalCounts = {};
    const tables = ['discoveries', 'contenders', 'decisions', 'positions', 'theses', 'outcomes', 'portfolio_alerts'];
    
    for (const table of tables) {
      try {
        const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
        finalCounts[table] = result.count;
      } catch (e) {
        finalCounts[table] = 0;
      }
    }

    res.json({
      success: true,
      message: 'Postgres populated successfully',
      added: {
        contenders: addedContenders,
        discoveries: addedDiscoveries,
        outcomes: addedOutcomes
      },
      finalCounts
    });

  } catch (err) {
    console.error('❌ Population API error:', err);
    res.status(500).json({
      error: 'Population failed',
      details: err.message
    });
  }
});

module.exports = router;