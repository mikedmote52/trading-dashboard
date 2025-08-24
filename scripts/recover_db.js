/**
 * Database recovery script
 * Creates clean database with enrichment schema and sample data
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'trading_dashboard.db');

function recoverDatabase() {
  console.log('🔄 Creating clean database with enrichment schema...');
  
  const db = new Database(dbPath);
  
  // Enable WAL mode and safe settings
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA busy_timeout=5000;');
  db.exec('PRAGMA foreign_keys=ON;');
  
  // Create discoveries table with enrichment columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS discoveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      score REAL DEFAULT 50,
      price REAL DEFAULT 0,
      action TEXT DEFAULT 'MONITOR',
      confidence INTEGER DEFAULT 60,
      thesis TEXT,
      engine TEXT DEFAULT 'screener',
      run_id TEXT,
      snapshot_ts TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      components_json TEXT,
      reasons_json TEXT,
      score_momentum REAL,
      score_squeeze REAL,
      score_sentiment REAL,
      score_options REAL,
      score_technical REAL,
      score_composite REAL
    )
  `);
  
  // Create latest_scores table for fallback
  db.exec(`
    CREATE TABLE IF NOT EXISTS latest_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      score REAL DEFAULT 50,
      price REAL DEFAULT 0,
      current_price REAL DEFAULT 0,
      thesis TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Insert sample enriched discoveries for testing
  const sampleDiscoveries = [
    { symbol: 'TSLA', score: 85, price: 245.50, composite: 82 },
    { symbol: 'NVDA', score: 90, price: 475.20, composite: 88 },
    { symbol: 'AMD', score: 75, price: 168.30, composite: 78 },
    { symbol: 'PLTR', score: 70, price: 158.90, composite: 75 },
    { symbol: 'SOFI', score: 65, price: 25.15, composite: 73 },
    { symbol: 'RBLX', score: 68, price: 117.80, composite: 76 },
    { symbol: 'UPST', score: 72, price: 68.90, composite: 77 },
    { symbol: 'AFRM', score: 69, price: 79.60, composite: 74 }
  ];
  
  const insertDiscovery = db.prepare(`
    INSERT INTO discoveries (
      symbol, score, price, action, confidence, thesis, engine, run_id, 
      snapshot_ts, components_json, reasons_json, score_momentum, 
      score_squeeze, score_sentiment, score_options, score_technical, score_composite
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  sampleDiscoveries.forEach(item => {
    const reasons = ['High volatility', 'VWAP reclaim/hold', 'EMA bullish cross'];
    const components = {
      momentum: { relVol: 2.5, atrPct: 0.06, rsi: 65, vwapDist: 1.2 },
      squeeze: { floatM: null, shortPct: null, borrowFee: null, util: null, dtc: null },
      options: { callPutRatio: null, nearMoneyCallOI: null, ivPctile: null, gammaExposure: null },
      sentiment: { reddit: 0, stocktwits: 0, youtube: 0, score: null, topBuzz: false },
      technical: { ema9_gt_ema20: true, ema9: null, ema20: null, holdingVWAP: true }
    };
    
    const action = item.composite >= 80 ? 'BUY' : item.composite >= 75 ? 'EARLY_READY' : 'PRE_BREAKOUT';
    const thesis = `Strong momentum play with ${item.composite} composite score. ${reasons.join(', ')}.`;
    
    insertDiscovery.run(
      item.symbol,
      item.score,
      item.price,
      action,
      Math.min(95, Math.max(60, item.composite)),
      thesis,
      'enriched_composite',
      'recovery_seed',
      new Date().toISOString(),
      JSON.stringify(components),
      JSON.stringify(reasons),
      75, // momentum
      0,  // squeeze (no data)
      0,  // sentiment (no data)
      0,  // options (no data)
      80, // technical
      item.composite
    );
  });
  
  // Insert fallback data in latest_scores
  const insertScore = db.prepare(`
    INSERT INTO latest_scores (ticker, score, price, current_price, thesis) 
    VALUES (?, ?, ?, ?, ?)
  `);
  
  sampleDiscoveries.forEach(item => {
    insertScore.run(
      item.symbol,
      item.score,
      item.price,
      item.price,
      `Recovery fallback score: ${item.score}`
    );
  });
  
  db.close();
  console.log(`✅ Database recovered with ${sampleDiscoveries.length} sample discoveries`);
}

if (require.main === module) {
  recoverDatabase();
}

module.exports = { recoverDatabase };