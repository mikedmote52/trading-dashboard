#!/usr/bin/env node

/**
 * Fix Postgres schema and populate data from SQLite
 */

const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

async function fixSchema() {
  // Setup Postgres connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  // Setup SQLite connection
  const sqlitePath = process.env.DB_PATH || '/var/data/trading_dashboard.db';
  const sqlite = new Database(sqlitePath, { readonly: true });

  console.log('🔧 Fixing Postgres schema and syncing data...');
  console.log('📂 SQLite source:', sqlitePath);
  console.log('🐘 Postgres target:', process.env.DATABASE_URL.split('@')[1]?.split('/')[0]);

  try {
    // 1. Add missing columns
    const alterQueries = [
      `ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS score_composite DECIMAL(5,2) DEFAULT 0`,
      `ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS vigl_score DECIMAL(5,2) DEFAULT 0`,
      `ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS catalyst_score DECIMAL(5,2) DEFAULT 0`,
      `ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS volume_ratio DECIMAL(10,2) DEFAULT 0`,
      `ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS borrow_rate DECIMAL(5,2) DEFAULT 0`,
      `ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS short_interest DECIMAL(5,2) DEFAULT 0`,
      
      `ALTER TABLE contenders ADD COLUMN IF NOT EXISTS subscores JSONB DEFAULT '{}'`,
      `ALTER TABLE contenders ADD COLUMN IF NOT EXISTS reasons TEXT[] DEFAULT '{}'`,
      `ALTER TABLE contenders ADD COLUMN IF NOT EXISTS engine TEXT DEFAULT 'composite'`,
      `ALTER TABLE contenders ADD COLUMN IF NOT EXISTS run_id TEXT`,
      
      `ALTER TABLE decisions ADD COLUMN IF NOT EXISTS entry_price DECIMAL(10,2)`,
      `ALTER TABLE decisions ADD COLUMN IF NOT EXISTS stop_price DECIMAL(10,2)`,
      `ALTER TABLE decisions ADD COLUMN IF NOT EXISTS tp1_price DECIMAL(10,2)`,
      `ALTER TABLE decisions ADD COLUMN IF NOT EXISTS tp2_price DECIMAL(10,2)`,
      `ALTER TABLE decisions ADD COLUMN IF NOT EXISTS size_plan JSONB DEFAULT '{}'`,
      `ALTER TABLE decisions ADD COLUMN IF NOT EXISTS rationale JSONB DEFAULT '{}'`,
    ];

    console.log('\n📋 Adding missing columns...');
    for (const query of alterQueries) {
      try {
        await pool.query(query);
        const col = query.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
        console.log('  ✅', col);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.error('  ⚠️', err.message);
        }
      }
    }

    // 2. Copy contenders from SQLite to Postgres
    console.log('\n📋 Syncing contenders from SQLite...');
    const sqliteContenders = sqlite.prepare(`
      SELECT * FROM contenders 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();
    
    console.log(`  Found ${sqliteContenders.length} contenders in SQLite`);
    
    // Clear existing Postgres contenders
    await pool.query('DELETE FROM contenders');
    
    // Insert SQLite contenders into Postgres
    let inserted = 0;
    for (const row of sqliteContenders) {
      try {
        const subscores = row.subscores ? JSON.parse(row.subscores) : {};
        const reasons = row.reasons ? JSON.parse(row.reasons) : [];
        
        await pool.query(`
          INSERT INTO contenders (
            ticker, price, score, action, confidence, thesis, 
            engine, run_id, snapshot_ts, subscores, reasons, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          row.ticker,
          row.price || 0,
          row.score || 70,
          row.action || 'BUY',
          row.confidence || row.score || 70,
          row.thesis || '',
          row.engine || 'composite',
          row.run_id || 'migration',
          row.snapshot_ts || new Date().toISOString(),
          subscores,
          reasons,
          row.created_at || new Date().toISOString()
        ]);
        inserted++;
      } catch (err) {
        console.error(`  ⚠️ Failed to insert ${row.ticker}:`, err.message);
      }
    }
    console.log(`  ✅ Inserted ${inserted} contenders into Postgres`);

    // 3. Generate decisions from high-scoring contenders
    console.log('\n📋 Generating decisions from contenders...');
    const highScorers = await pool.query(`
      SELECT * FROM contenders 
      WHERE score >= 75 
      ORDER BY score DESC 
      LIMIT 10
    `);
    
    // Clear existing decisions
    await pool.query('DELETE FROM decisions');
    
    // Create decisions
    let decisionsCreated = 0;
    for (const contender of highScorers.rows) {
      const entry = contender.price;
      const stop = entry * 0.90;
      const tp1 = entry * 1.20;
      const tp2 = entry * 1.50;
      
      const sizePlan = {
        initial: 100,
        scale_in: [50, 100, 150],
        max_exposure: 500,
        conditions: {
          scale_when: "score >= 75 && rvol >= 3",
          reduce_when: "score < 70 || rvol < 2"
        }
      };
      
      const rationale = {
        catalyst: contender.reasons || [],
        technical: "Strong momentum with volume support",
        risk: "Stop at -10% from entry",
        confidence: contender.confidence
      };
      
      await pool.query(`
        INSERT INTO decisions (
          ticker, action, confidence, thesis, score,
          entry_price, stop_price, tp1_price, tp2_price,
          size_plan, rationale, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        contender.ticker,
        'BUY CANDIDATE',
        contender.confidence,
        contender.thesis,
        contender.score,
        entry,
        stop,
        tp1,
        tp2,
        sizePlan,
        rationale,
        new Date().toISOString()
      ]);
      decisionsCreated++;
    }
    console.log(`  ✅ Created ${decisionsCreated} decisions`);

    // 4. Show final counts
    const counts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM discoveries) as discoveries,
        (SELECT COUNT(*) FROM contenders) as contenders,
        (SELECT COUNT(*) FROM decisions) as decisions,
        (SELECT COUNT(*) FROM positions) as positions
    `);
    
    console.log('\n📊 Final data counts in Postgres:');
    console.log('  Discoveries:', counts.rows[0].discoveries);
    console.log('  Contenders:', counts.rows[0].contenders);
    console.log('  Decisions:', counts.rows[0].decisions);
    console.log('  Positions:', counts.rows[0].positions);

    console.log('\n✅ Schema fixed and data synced successfully!');
    console.log('\n🔄 Next steps:');
    console.log('  1. Restart the web service to pick up new data');
    console.log('  2. Check dashboard at https://trading-dashboard-dvou.onrender.com');
    console.log('  3. Verify /api/decisions/latest returns data');

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    sqlite.close();
    await pool.end();
  }
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  console.log('\nGet it from Render dashboard:');
  console.log('1. Go to your vigl-database service');
  console.log('2. Copy the Internal Database URL');
  console.log('3. Run: DATABASE_URL="postgresql://..." node scripts/fix_postgres_schema.js');
  process.exit(1);
}

fixSchema().catch(console.error);