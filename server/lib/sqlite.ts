import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { resolveDbPath } from "./dbPath";

export async function openDB(): Promise<Database> {
  const filename = resolveDbPath();
  console.log("[db] open", { filename });
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000;");
  return db;
}