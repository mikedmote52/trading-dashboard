/**
 * Database adapter that supports both SQLite and Postgres
 * Uses Postgres when USE_POSTGRES=true or DATABASE_URL is present
 */

const { flag } = require('./envFlags');

class DatabaseAdapter {
  constructor() {
    this.type = null;
    this.client = null;
    this.dbPath = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const USE_POSTGRES = flag('USE_POSTGRES', false) || !!process.env.DATABASE_URL;
    
    if (USE_POSTGRES && process.env.DATABASE_URL) {
      // Use Postgres
      const { Pool } = require('pg');
      this.type = 'postgres';
      this.client = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      
      // Test connection
      try {
        const result = await this.client.query('SELECT NOW()');
        console.log('[db] Connected to Postgres at', new Date(result.rows[0].now).toISOString());
      } catch (err) {
        console.error('[db] Failed to connect to Postgres:', err.message);
        throw err;
      }
    } else {
      // Use SQLite
      const Database = require('better-sqlite3');
      const { resolveDbPath } = require('./dbPath');
      this.type = 'sqlite';
      this.dbPath = resolveDbPath();
      this.client = new Database(this.dbPath, {
        verbose: process.env.DEBUG_SQL === 'true' ? console.log : null,
        timeout: 5000
      });
      this.client.pragma('journal_mode = WAL');
      this.client.pragma('busy_timeout = 5000');
      console.log('[db] Connected to SQLite at', this.dbPath);
    }
    
    this.initialized = true;
  }

  async query(sql, params = []) {
    if (!this.initialized) await this.initialize();
    
    if (this.type === 'postgres') {
      try {
        const result = await this.client.query(sql, params);
        return result.rows;
      } catch (err) {
        console.error('[db] Postgres query error:', err.message);
        throw err;
      }
    } else {
      // SQLite
      try {
        const stmt = this.client.prepare(sql);
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          return stmt.all(...params);
        } else {
          const result = stmt.run(...params);
          return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
        }
      } catch (err) {
        console.error('[db] SQLite query error:', err.message);
        throw err;
      }
    }
  }

  async run(sql, params = []) {
    return this.query(sql, params);
  }

  async all(sql, params = []) {
    return this.query(sql, params);
  }

  async get(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  async exec(sql) {
    if (!this.initialized) await this.initialize();
    
    if (this.type === 'postgres') {
      await this.client.query(sql);
    } else {
      this.client.exec(sql);
    }
  }

  async transaction(callback) {
    if (!this.initialized) await this.initialize();
    
    if (this.type === 'postgres') {
      const client = await this.client.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const trx = this.client.transaction(callback);
      return trx();
    }
  }

  async close() {
    if (!this.initialized) return;
    
    if (this.type === 'postgres') {
      await this.client.end();
    } else {
      this.client.close();
    }
    
    this.initialized = false;
  }

  getType() {
    return this.type;
  }

  getConnectionString() {
    if (this.type === 'postgres') {
      const url = process.env.DATABASE_URL;
      if (url) {
        // Mask password in connection string
        return url.replace(/:([^@]+)@/, ':****@');
      }
    }
    return this.dbPath;
  }
}

// Singleton instance
let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseAdapter();
  }
  return dbInstance;
}

module.exports = {
  getDb,
  DatabaseAdapter
};