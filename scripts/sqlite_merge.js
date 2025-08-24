import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "node:path";

const serverDb = process.env.DB_PATH || "/var/data/trading_dashboard.db";
const sourceDb = process.env.SOURCE_DB || "./trading_dashboard.db"; // set this!

function log(...a) { 
  console.log("[merge]", ...a); 
}

const tables = [
  "discoveries", 
  "discoveries_vigl", 
  "features_snapshot", 
  "features_snapshots", 
  "research_discoveries", 
  "theses", 
  "trading_decisions",
  "portfolio_decisions",
  "data_status",
  "latest_scores",
  "scoring_weights",
  "scoring_weights_kv",
  "thesis_history",
  "research_alerts",
  "research_performance",
  "research_sessions"
];

const attach = async (db) => {
  await db.exec(`ATTACH DATABASE '${sourceDb.replace(/'/g,"''")}' AS src;`);
};

const copyTable = async (db, t) => {
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS "${t}" AS SELECT * FROM src."${t}" WHERE 0;`);
  } catch (e) {
    log(`skip create ${t}:`, e.message);
  }
  
  try {
    const cols = await db.all(`PRAGMA table_info("${t}")`);
    const names = cols.map(c => `"${c.name}"`).join(",");
    const sql = `INSERT OR IGNORE INTO "${t}" (${names}) SELECT ${names} FROM src."${t}";`;
    const before = await db.get(`SELECT COUNT(*) n FROM "${t}"`);
    await db.exec("BEGIN");
    await db.exec(sql);
    await db.exec("COMMIT");
    const after = await db.get(`SELECT COUNT(*) n FROM "${t}"`);
    log(`table=${t} ${before?.n || 0} -> ${after?.n || 0}`);
  } catch (e) {
    log(`skip copy ${t}:`, e.message);
  }
};

(async () => {
  try {
    log(`Merging from ${sourceDb} into ${serverDb}`);
    const db = await open({ filename: serverDb, driver: sqlite3.Database });
    await db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    
    try {
      await attach(db);
      for (const t of tables) {
        try { 
          await copyTable(db, t); 
        } catch (e) { 
          log(`skip ${t}:`, e.message); 
        }
      }
      await db.exec("DETACH DATABASE src;");
    } catch (e) {
      log("attach error:", e.message);
    }
    
    await db.close();
    log("done");
  } catch (e) {
    console.error("[merge] fatal error:", e);
    process.exit(1);
  }
})();