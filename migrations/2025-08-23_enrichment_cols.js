const Database = require('better-sqlite3');
const path = require('path');

const ADD = (n, sql) => `ALTER TABLE discoveries ADD COLUMN ${n} ${sql};`;

function up(dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'trading_dashboard.db')) {
  const db = new Database(dbPath);
  const cols = new Set(db.prepare(`PRAGMA table_info(discoveries)`).all().map(r => r.name));
  
  const exec = (n, sql) => {
    if (!cols.has(n)) {
      try {
        db.exec(ADD(n, sql));
        console.log(`✅ Added column: ${n}`);
      } catch (e) {
        console.warn(`⚠️ Column ${n} may already exist:`, e.message);
      }
    }
  };

  exec("components_json", "TEXT");       // stores per-component metrics JSON
  exec("reasons_json", "TEXT");          // array of strings
  exec("score_momentum", "REAL");
  exec("score_squeeze", "REAL");
  exec("score_sentiment", "REAL");
  exec("score_options", "REAL");
  exec("score_technical", "REAL");
  exec("score_composite", "REAL");
  
  db.close();
  console.log("✅ Enrichment schema migration complete");
}

// Run migration if called directly
if (require.main === module) {
  try {
    up();
    console.log("✅ enrichment migration");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

module.exports = { up };