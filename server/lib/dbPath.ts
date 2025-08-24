import path from "node:path";

export function resolveDbPath(): string {
  const p = (process.env.DB_PATH || "/var/data/trading_dashboard.db").trim();
  // Force absolute deterministic path
  return path.isAbsolute(p) ? p : path.resolve(p);
}