const path = require("path");

function resolveDbPath() {
  // Use DB_PATH if set, otherwise fall back to legacy SQLITE_DB_PATH, then default
  const envPath = process.env.DB_PATH || process.env.SQLITE_DB_PATH;
  const defaultPath = envPath || path.join(__dirname, '..', '..', 'trading_dashboard.db');
  
  // Force absolute deterministic path
  return path.isAbsolute(defaultPath) ? defaultPath : path.resolve(defaultPath);
}

module.exports = { resolveDbPath };