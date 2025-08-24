import { Router } from "express";
import { openDB } from "../lib/sqlite";

const r = Router();

r.get("/db", async (_req, res) => {
  try {
    const db = await openDB();
    const list = await db.all("PRAGMA database_list;");
    const file = list.find((x: any) => x.name === "main")?.file || null;
    const rows = await db.get("SELECT COUNT(*) AS n FROM discoveries;");
    await db.close();
    res.json({
      env: { DB_PATH: process.env.DB_PATH || null },
      mainFile: file,
      tables: { discoveries: rows?.n ?? 0 }
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

export default r;