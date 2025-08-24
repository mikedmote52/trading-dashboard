const FLAGS = require('../config/flags');
let pgPool = null;
if (FLAGS.USE_POSTGRES) { 
  const { Pool } = require('pg'); 
  pgPool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  }); 
}

async function initDiscoveryRepo(){
  if (FLAGS.USE_POSTGRES) {
    console.log('📊 Discoveries repository connected to: Postgres');
    await pgPool.query(`CREATE TABLE IF NOT EXISTS discoveries (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT now(),
      ticker TEXT,
      meta JSONB
    )`);
    return { type:'pg', query:(t,p)=>pgPool.query(t,p) };
  }
  // fallback: existing SQLite path for local dev
  console.log('📊 Discoveries repository connected to: SQLite (development)');
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(process.cwd(), 'trading_dashboard.db');
  const db = new Database(dbPath);
  
  db.exec(`CREATE TABLE IF NOT EXISTS discoveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ticker TEXT,
    meta TEXT
  )`);
  
  return { 
    type: 'sqlite', 
    query: (sql, params) => {
      try {
        return { rows: db.prepare(sql).all(params || []) };
      } catch (e) {
        throw e;
      }
    }
  };
}

module.exports = { initDiscoveryRepo };