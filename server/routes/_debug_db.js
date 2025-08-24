const { Router } = require("express");
const { getDb } = require("../lib/db");

const r = Router();

r.get("/db", async (_req, res) => {
  try {
    const db = getDb();
    await db.initialize();
    
    // Get table counts
    const tables = [
      'discoveries', 'discoveries_vigl', 'contenders', 'decisions',
      'positions', 'theses', 'portfolio_alerts', 'outcomes'
    ];
    
    const counts = {};
    for (const table of tables) {
      try {
        const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = result?.count || 0;
      } catch (e) {
        counts[table] = 0;
      }
    }
    
    res.json({
      type: db.getType(),
      urlMask: db.getConnectionString(),
      env: { 
        DB_PATH: process.env.DB_PATH || null,
        DATABASE_URL: process.env.DATABASE_URL ? '***masked***' : null,
        USE_POSTGRES: process.env.USE_POSTGRES || null
      },
      counts
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

module.exports = r;