#!/usr/bin/env node
/**
 * One-shot migration script from SQLite to Postgres
 * Copies all data from SQLite to Postgres preserving structure
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const TABLES_TO_MIGRATE = [
  'discoveries',
  'discoveries_vigl', 
  'contenders',
  'decisions',
  'positions',
  'theses',
  'thesis_history',
  'portfolio_alerts',
  'research_discoveries',
  'research_performance',
  'research_sessions',
  'scoring_weights',
  'scoring_weights_kv',
  'outcomes',
  'trading_decisions',
  'data_status'
];

// PostgreSQL schema definitions
const PG_SCHEMAS = {
  discoveries: `
    CREATE TABLE IF NOT EXISTS discoveries (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      score DECIMAL(5,2),
      latest_price DECIMAL(10,2),
      volume_ratio DECIMAL(10,2),
      short_interest DECIMAL(5,2),
      borrow_fee DECIMAL(5,2),
      thesis TEXT,
      catalyst TEXT,
      risk_level VARCHAR(20),
      entry_point DECIMAL(10,2),
      stop_loss DECIMAL(10,2),
      target_1 DECIMAL(10,2),
      target_2 DECIMAL(10,2),
      discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(50),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  discoveries_vigl: `
    CREATE TABLE IF NOT EXISTS discoveries_vigl (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      vigl_score DECIMAL(5,2),
      volume_spike DECIMAL(10,2),
      price DECIMAL(10,2),
      market_cap BIGINT,
      float_shares BIGINT,
      short_interest DECIMAL(5,2),
      options_flow VARCHAR(20),
      catalyst TEXT,
      discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  contenders: `
    CREATE TABLE IF NOT EXISTS contenders (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      score DECIMAL(5,2),
      price DECIMAL(10,2),
      volume_ratio DECIMAL(10,2),
      short_interest DECIMAL(5,2),
      borrow_fee DECIMAL(5,2),
      thesis TEXT,
      catalyst TEXT,
      entry_point DECIMAL(10,2),
      stop_loss DECIMAL(10,2),
      target_1 DECIMAL(10,2),
      target_2 DECIMAL(10,2),
      status VARCHAR(20) DEFAULT 'active',
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  decisions: `
    CREATE TABLE IF NOT EXISTS decisions (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      action VARCHAR(50) NOT NULL,
      entry DECIMAL(10,2),
      stop DECIMAL(10,2),
      tp1 DECIMAL(10,2),
      tp2 DECIMAL(10,2),
      size_plan TEXT,
      rationale JSONB,
      status VARCHAR(20) DEFAULT 'planned',
      executed_at TIMESTAMP,
      closed_at TIMESTAMP,
      pnl DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  positions: `
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      quantity INTEGER,
      avg_price DECIMAL(10,2),
      current_price DECIMAL(10,2),
      unrealized_pnl DECIMAL(10,2),
      realized_pnl DECIMAL(10,2),
      status VARCHAR(20),
      opened_at TIMESTAMP,
      closed_at TIMESTAMP,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  theses: `
    CREATE TABLE IF NOT EXISTS theses (
      id SERIAL PRIMARY KEY,
      position_id INTEGER REFERENCES positions(id),
      symbol VARCHAR(10) NOT NULL,
      thesis TEXT,
      confidence DECIMAL(5,2),
      risk_level VARCHAR(20),
      target_1 DECIMAL(10,2),
      target_2 DECIMAL(10,2),
      stop_loss DECIMAL(10,2),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  thesis_history: `
    CREATE TABLE IF NOT EXISTS thesis_history (
      id SERIAL PRIMARY KEY,
      thesis_id INTEGER REFERENCES theses(id),
      symbol VARCHAR(10) NOT NULL,
      old_thesis TEXT,
      new_thesis TEXT,
      old_confidence DECIMAL(5,2),
      new_confidence DECIMAL(5,2),
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  portfolio_alerts: `
    CREATE TABLE IF NOT EXISTS portfolio_alerts (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      alert_type VARCHAR(50),
      message TEXT,
      severity VARCHAR(20),
      action_suggested TEXT,
      metadata JSONB,
      acknowledged BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  research_discoveries: `
    CREATE TABLE IF NOT EXISTS research_discoveries (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      research_type VARCHAR(50),
      findings TEXT,
      score DECIMAL(5,2),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  research_performance: `
    CREATE TABLE IF NOT EXISTS research_performance (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      entry_date DATE,
      exit_date DATE,
      entry_price DECIMAL(10,2),
      exit_price DECIMAL(10,2),
      return_pct DECIMAL(10,2),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  research_sessions: `
    CREATE TABLE IF NOT EXISTS research_sessions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(100),
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      symbols_analyzed INTEGER,
      discoveries_found INTEGER,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  scoring_weights: `
    CREATE TABLE IF NOT EXISTS scoring_weights (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      weights JSONB,
      active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  scoring_weights_kv: `
    CREATE TABLE IF NOT EXISTS scoring_weights_kv (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) NOT NULL UNIQUE,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  outcomes: `
    CREATE TABLE IF NOT EXISTS outcomes (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      discovery_id INTEGER,
      entry_price DECIMAL(10,2),
      exit_price DECIMAL(10,2),
      entry_date DATE,
      exit_date DATE,
      return_pct DECIMAL(10,2),
      outcome VARCHAR(20),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  trading_decisions: `
    CREATE TABLE IF NOT EXISTS trading_decisions (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      decision_type VARCHAR(50),
      reasoning TEXT,
      confidence DECIMAL(5,2),
      executed BOOLEAN DEFAULT false,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  
  data_status: `
    CREATE TABLE IF NOT EXISTS data_status (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50) NOT NULL,
      last_update TIMESTAMP,
      status VARCHAR(20),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
};

async function migrateTable(sqliteDb, pgPool, tableName) {
  console.log(`\n📋 Migrating table: ${tableName}`);
  
  try {
    // Check if table exists in SQLite
    const tableExists = sqliteDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    
    if (!tableExists) {
      console.log(`   ⚠️  Table ${tableName} does not exist in SQLite, skipping`);
      return { skipped: true, reason: 'not_in_source' };
    }
    
    // Get source count
    const sourceCount = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count;
    console.log(`   📊 Source rows: ${sourceCount}`);
    
    if (sourceCount === 0) {
      console.log(`   ⚠️  No data to migrate`);
      return { migrated: 0, source: sourceCount };
    }
    
    // Create table in Postgres if needed
    if (PG_SCHEMAS[tableName]) {
      await pgPool.query(PG_SCHEMAS[tableName]);
      
      // Create indexes
      await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_symbol ON ${tableName}(symbol)`).catch(() => {});
      await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_created_at ON ${tableName}(created_at)`).catch(() => {});
    }
    
    // Check target count
    const targetResult = await pgPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const targetCount = parseInt(targetResult.rows[0].count);
    
    if (targetCount > 0) {
      console.log(`   ⚠️  Target table already has ${targetCount} rows, skipping`);
      return { skipped: true, reason: 'target_not_empty', existing: targetCount };
    }
    
    // Get all rows from SQLite
    const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
    
    if (rows.length === 0) {
      return { migrated: 0, source: sourceCount };
    }
    
    // Build insert query
    const columns = Object.keys(rows[0]).filter(col => col !== 'id');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    // Insert in batches
    const BATCH_SIZE = 100;
    let inserted = 0;
    
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      
      for (const row of batch) {
        const values = columns.map(col => {
          let val = row[col];
          // Convert JSON strings to objects for JSONB columns
          if (typeof val === 'string' && (col === 'metadata' || col === 'rationale' || col === 'weights')) {
            try {
              val = JSON.parse(val);
            } catch (e) {
              // Keep as string if not valid JSON
            }
          }
          return val;
        });
        
        try {
          await pgPool.query(insertSql, values);
          inserted++;
        } catch (err) {
          console.error(`   ❌ Failed to insert row:`, err.message);
        }
      }
      
      console.log(`   ✅ Inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} rows`);
    }
    
    // Verify final count
    const finalResult = await pgPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const finalCount = parseInt(finalResult.rows[0].count);
    
    console.log(`   ✅ Migration complete: ${finalCount} rows in Postgres`);
    
    return {
      source: sourceCount,
      migrated: inserted,
      final: finalCount
    };
    
  } catch (err) {
    console.error(`   ❌ Error migrating ${tableName}:`, err.message);
    return { error: err.message };
  }
}

async function main() {
  console.log('🚀 SQLite to Postgres Migration Script');
  console.log('=====================================\n');
  
  // Check environment
  const sqlitePath = process.env.DB_PATH || './trading_dashboard.db';
  const pgUrl = process.env.DATABASE_URL;
  
  if (!pgUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }
  
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ SQLite file not found at ${sqlitePath}`);
    process.exit(1);
  }
  
  console.log(`📂 SQLite source: ${sqlitePath}`);
  console.log(`🐘 Postgres target: ${pgUrl.replace(/:([^@]+)@/, ':****@')}\n`);
  
  // Connect to databases
  const sqliteDb = new Database(sqlitePath, { readonly: true });
  const pgPool = new Pool({
    connectionString: pgUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    // Test Postgres connection
    const testResult = await pgPool.query('SELECT NOW()');
    console.log(`✅ Connected to Postgres at ${testResult.rows[0].now}\n`);
    
    // Migration results
    const results = {};
    
    // Migrate each table
    for (const table of TABLES_TO_MIGRATE) {
      results[table] = await migrateTable(sqliteDb, pgPool, table);
    }
    
    // Summary
    console.log('\n📊 Migration Summary');
    console.log('===================');
    
    let totalSource = 0;
    let totalMigrated = 0;
    
    for (const [table, result] of Object.entries(results)) {
      if (result.error) {
        console.log(`${table}: ❌ Error - ${result.error}`);
      } else if (result.skipped) {
        console.log(`${table}: ⚠️  Skipped - ${result.reason}`);
      } else {
        totalSource += result.source || 0;
        totalMigrated += result.migrated || 0;
        console.log(`${table}: ✅ ${result.migrated}/${result.source} rows migrated`);
      }
    }
    
    console.log(`\n✅ Total: ${totalMigrated}/${totalSource} rows migrated`);
    
    // Get final counts from Postgres
    console.log('\n📊 Final Postgres Counts');
    console.log('=======================');
    
    for (const table of TABLES_TO_MIGRATE) {
      try {
        const result = await pgPool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`${table}: ${result.rows[0].count} rows`);
      } catch (err) {
        console.log(`${table}: - (table not found)`);
      }
    }
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
  
  console.log('\n✅ Migration complete!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { migrateTable };