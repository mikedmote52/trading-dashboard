#!/usr/bin/env node
/**
 * Populate Postgres with sample data for production testing
 * This simulates migration data when direct SQLite->Postgres migration isn't available
 */

require('dotenv').config();

async function populatePostgres() {
  console.log('🚀 Populating Postgres with Sample Data');
  console.log('========================================\n');

  // Set environment to use Postgres
  process.env.USE_POSTGRES = 'true';
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found - this script must run in production');
    process.exit(1);
  }

  const { getDb } = require('../server/lib/db');
  
  const db = getDb();
  await db.initialize();
  
  console.log(`✅ Connected to database: ${db.getType()}`);
  
  if (db.getType() !== 'postgres') {
    console.error('❌ Expected Postgres but got', db.getType());
    process.exit(1);
  }

  try {
    // Add sample contenders (high scoring candidates for decisions generator)
    console.log('📊 Adding sample contenders...');
    
    const contenders = [
      { symbol: 'NVDA', score: 87.5, price: 450.50, volume_ratio: 4.2, short_interest: 15.2, borrow_fee: 2.8 },
      { symbol: 'TSLA', score: 82.1, price: 240.30, volume_ratio: 3.8, short_interest: 12.5, borrow_fee: 3.1 },
      { symbol: 'AMD', score: 79.8, price: 145.20, volume_ratio: 5.1, short_interest: 18.6, borrow_fee: 2.5 },
      { symbol: 'MSTR', score: 84.2, price: 358.13, volume_ratio: 2.9, short_interest: 8.3, borrow_fee: 4.2 },
      { symbol: 'PLTR', score: 76.5, price: 158.74, volume_ratio: 2.1, short_interest: 22.1, borrow_fee: 1.8 }
    ];

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
        
        console.log(`  ✅ Added contender: ${contender.symbol} (Score: ${contender.score})`);
      }
    }

    // Add sample discoveries
    console.log('🔍 Adding sample discoveries...');
    
    const discoveries = [
      { symbol: 'NVDA', score: 87.5, latest_price: 450.50, source: 'universe_screener' },
      { symbol: 'TSLA', score: 82.1, latest_price: 240.30, source: 'universe_screener' },
      { symbol: 'AMD', score: 79.8, latest_price: 145.20, source: 'universe_screener' },
      { symbol: 'CRWD', score: 74.2, latest_price: 420.55, source: 'universe_screener' },
      { symbol: 'SHOP', score: 71.8, latest_price: 142.11, source: 'universe_screener' }
    ];

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
        
        console.log(`  ✅ Added discovery: ${discovery.symbol} (Score: ${discovery.score})`);
      }
    }

    // Add sample outcome for backtesting
    console.log('📈 Adding sample outcomes...');
    
    const outcomes = [
      { symbol: 'VIGL', entry_price: 3.45, exit_price: 18.12, return_pct: 425.2, outcome: 'win' }
    ];

    for (const outcome of outcomes) {
      const existing = await db.get('SELECT id FROM outcomes WHERE symbol = ?', [outcome.symbol]);
      
      if (!existing) {
        await db.run(`
          INSERT INTO outcomes (
            symbol, entry_price, exit_price, entry_date, exit_date,
            return_pct, outcome, created_at
          ) VALUES (?, ?, ?, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '5 days', ?, ?, CURRENT_TIMESTAMP)
        `, [
          outcome.symbol,
          outcome.entry_price,
          outcome.exit_price,
          outcome.return_pct,
          outcome.outcome
        ]);
        
        console.log(`  ✅ Added outcome: ${outcome.symbol} (+${outcome.return_pct}%)`);
      }
    }

    // Get final counts
    console.log('\n📊 Final counts:');
    const tables = ['discoveries', 'contenders', 'decisions', 'positions', 'theses', 'outcomes', 'portfolio_alerts'];
    
    for (const table of tables) {
      try {
        const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${result.count} rows`);
      } catch (e) {
        console.log(`  ${table}: 0 rows (table not found)`);
      }
    }
    
    console.log('\n✅ Postgres populated successfully!');
    
  } catch (err) {
    console.error('❌ Population failed:', err.message);
    throw err;
  }
}

populatePostgres().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});