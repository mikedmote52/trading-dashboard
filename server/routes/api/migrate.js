const express = require('express');
const router = express.Router();

// Migration endpoint for production use
router.post('/run', async (req, res) => {
  try {
    console.log('🚀 Migration API called');
    
    // Security check - only allow in production with proper setup
    if (!process.env.DATABASE_URL) {
      return res.status(400).json({
        error: 'DATABASE_URL not configured',
        message: 'Migration can only run with Postgres DATABASE_URL set'
      });
    }

    // Import migration script
    const fs = require('fs');
    const path = require('path');
    const Database = require('better-sqlite3');
    const { Pool } = require('pg');

    const sqlitePath = process.env.DB_PATH || './trading_dashboard.db';
    const pgUrl = process.env.DATABASE_URL;

    if (!fs.existsSync(sqlitePath)) {
      return res.status(404).json({
        error: 'SQLite database not found',
        path: sqlitePath
      });
    }

    console.log(`📂 SQLite source: ${sqlitePath}`);
    console.log(`🐘 Postgres target: ${pgUrl.replace(/:([^@]+)@/, ':****@')}`);

    // Quick table count before migration
    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const sourceCounts = {};
    
    const tables = ['discoveries', 'contenders', 'decisions', 'positions', 'theses', 'outcomes'];
    for (const table of tables) {
      try {
        const result = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        sourceCounts[table] = result.count;
      } catch (e) {
        sourceCounts[table] = 0;
      }
    }

    sqliteDb.close();

    // Test Postgres connection
    const pgPool = new Pool({
      connectionString: pgUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
      const testResult = await pgPool.query('SELECT NOW()');
      console.log(`✅ Connected to Postgres at ${testResult.rows[0].now}`);
    } catch (err) {
      await pgPool.end();
      return res.status(500).json({
        error: 'Failed to connect to Postgres',
        details: err.message
      });
    }

    // Create basic tables structure in Postgres
    const createTablesSQL = `
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
      );

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
      );

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
      );

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
      );

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
      );

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
      );

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
      );
    `;

    await pgPool.query(createTablesSQL);
    console.log('✅ Postgres tables created/verified');

    await pgPool.end();

    res.json({
      success: true,
      message: 'Migration preparation complete',
      sourceCounts,
      note: 'Basic table structure created in Postgres. Data will be populated by background workers.'
    });

  } catch (err) {
    console.error('❌ Migration API error:', err);
    res.status(500).json({
      error: 'Migration failed',
      details: err.message
    });
  }
});

// Get migration status
router.get('/status', async (req, res) => {
  try {
    const { getDb } = require('../../lib/db');
    const db = getDb();
    await db.initialize();

    const status = {
      type: db.getType(),
      connection: db.getConnectionString()
    };

    if (status.type === 'postgres') {
      // Get table counts
      const tables = ['discoveries', 'contenders', 'decisions', 'positions', 'theses', 'outcomes', 'portfolio_alerts'];
      const counts = {};
      
      for (const table of tables) {
        try {
          const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
          counts[table] = result?.count || 0;
        } catch (e) {
          counts[table] = 0;
        }
      }
      
      status.counts = counts;
    }

    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;