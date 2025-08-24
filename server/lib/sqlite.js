const Database = require('better-sqlite3');
const { resolveDbPath } = require("./dbPath");

function openDB() {
  const filename = resolveDbPath();
  console.log("[db] open", { filename });
  const db = new Database(filename);
  
  // Set up WAL mode and timeouts
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec(`PRAGMA busy_timeout=${Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 4000)};`);
  db.pragma('foreign_keys = ON');
  
  return db;
}

module.exports = { openDB };