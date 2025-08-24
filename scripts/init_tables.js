#!/usr/bin/env node
/**
 * Initialize missing database tables
 */

require('dotenv').config();
const { getDb } = require('../server/lib/db');

const SQLITE_SCHEMAS = {
  contenders: `
    CREATE TABLE IF NOT EXISTS contenders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      score REAL,
      price REAL,
      volume_ratio REAL,
      short_interest REAL,
      borrow_fee REAL,
      thesis TEXT,
      catalyst TEXT,
      entry_point REAL,
      stop_loss REAL,
      target_1 REAL,
      target_2 REAL,
      status TEXT DEFAULT 'active',
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  
  decisions: `
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      entry REAL,
      stop REAL,
      tp1 REAL,
      tp2 REAL,
      size_plan TEXT,
      rationale TEXT,
      status TEXT DEFAULT 'planned',
      executed_at DATETIME,
      closed_at DATETIME,
      pnl REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  
  positions: `
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      quantity INTEGER,
      avg_price REAL,
      current_price REAL,
      unrealized_pnl REAL,
      realized_pnl REAL,
      status TEXT,
      opened_at DATETIME,
      closed_at DATETIME,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  
  theses: `
    CREATE TABLE IF NOT EXISTS theses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER,
      symbol TEXT NOT NULL,
      thesis TEXT,
      confidence REAL,
      risk_level TEXT,
      target_1 REAL,
      target_2 REAL,
      stop_loss REAL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (position_id) REFERENCES positions(id)
    )`,
  
  thesis_history: `
    CREATE TABLE IF NOT EXISTS thesis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thesis_id INTEGER,
      symbol TEXT NOT NULL,
      old_thesis TEXT,
      new_thesis TEXT,
      old_confidence REAL,
      new_confidence REAL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thesis_id) REFERENCES theses(id)
    )`,
  
  portfolio_alerts: `
    CREATE TABLE IF NOT EXISTS portfolio_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      alert_type TEXT,
      message TEXT,
      severity TEXT,
      action_suggested TEXT,
      metadata TEXT,
      acknowledged INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  
  outcomes: `
    CREATE TABLE IF NOT EXISTS outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      discovery_id INTEGER,
      entry_price REAL,
      exit_price REAL,
      entry_date DATE,
      exit_date DATE,
      return_pct REAL,
      outcome TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
};

async function initTables() {
  console.log('📋 Initializing Database Tables');
  console.log('================================\n');
  
  const db = getDb();
  await db.initialize();
  
  if (db.getType() !== 'sqlite') {
    console.log('⚠️  This script is for SQLite only. Postgres tables are created by migration.');
    return;
  }
  
  for (const [table, schema] of Object.entries(SQLITE_SCHEMAS)) {
    try {
      await db.exec(schema);
      const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`✅ ${table}: initialized (${result.count} rows)`);
    } catch (err) {
      console.error(`❌ ${table}: ${err.message}`);
    }
  }
  
  // Add some test data to contenders for decisions generator
  try {
    const existingContenders = await db.get('SELECT COUNT(*) as count FROM contenders');
    if (existingContenders.count === 0) {
      console.log('\n📝 Adding sample contenders...');
      
      const sampleContenders = [
        { symbol: 'NVDA', score: 85, price: 450.50, volume_ratio: 4.2, short_interest: 15 },
        { symbol: 'TSLA', score: 78, price: 240.30, volume_ratio: 3.8, short_interest: 12 },
        { symbol: 'AMD', score: 82, price: 145.20, volume_ratio: 5.1, short_interest: 18 }
      ];
      
      for (const c of sampleContenders) {
        await db.run(`
          INSERT INTO contenders (symbol, score, price, volume_ratio, short_interest, borrow_fee, 
                                 thesis, catalyst, entry_point, stop_loss, target_1, target_2)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          c.symbol, c.score, c.price, c.volume_ratio, c.short_interest, 2.5,
          'High momentum with squeeze potential', 'Earnings catalyst upcoming',
          c.price, c.price * 0.9, c.price * 1.2, c.price * 1.5
        ]);
      }
      
      console.log('✅ Added 3 sample contenders');
    }
  } catch (err) {
    console.error('⚠️  Could not add sample data:', err.message);
  }
  
  console.log('\n✅ Table initialization complete');
}

initTables().catch(err => {
  console.error('❌ Initialization failed:', err);
  process.exit(1);
});