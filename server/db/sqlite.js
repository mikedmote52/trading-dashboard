const Database = require('better-sqlite3');
const path = require('path');

// Create database in project root
const dbPath = path.join(__dirname, '../../trading_dashboard.db');
const db = new Database(dbPath);

// Initialize tables for trading ledger
db.exec(`
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  symbol TEXT NOT NULL,
  ts INTEGER NOT NULL,
  policy TEXT,
  features TEXT,
  recommendation TEXT,
  confidence REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty REAL NOT NULL,
  avg_price REAL,
  status TEXT NOT NULL,
  ts INTEGER NOT NULL,
  raw TEXT,
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE TABLE IF NOT EXISTS outcomes (
  decision_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  t1_pnl REAL,
  t5_pnl REAL,
  t20_pnl REAL,
  max_drawdown REAL,
  time_underwater INTEGER,
  closed INTEGER DEFAULT 0,
  last_update INTEGER NOT NULL,
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_decisions_ts ON decisions(ts);
CREATE INDEX IF NOT EXISTS idx_orders_decision ON orders(decision_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON outcomes(symbol);
`);

// Prepared statements
const insertDecision = db.prepare(`
  INSERT INTO decisions (id, kind, symbol, ts, policy, features, recommendation, confidence, notes)
  VALUES (@id, @kind, @symbol, @ts, @policy, @features, @recommendation, @confidence, @notes)
`);

const insertOrder = db.prepare(`
  INSERT INTO orders (id, decision_id, symbol, side, qty, avg_price, status, ts, raw)
  VALUES (@id, @decision_id, @symbol, @side, @qty, @avg_price, @status, @ts, @raw)
`);

const upsertOutcome = db.prepare(`
  INSERT INTO outcomes (decision_id, symbol, t1_pnl, t5_pnl, t20_pnl, max_drawdown, time_underwater, closed, last_update)
  VALUES (@decision_id, @symbol, @t1_pnl, @t5_pnl, @t20_pnl, @max_drawdown, @time_underwater, @closed, @last_update)
  ON CONFLICT(decision_id) DO UPDATE SET
    t1_pnl = @t1_pnl,
    t5_pnl = @t5_pnl,
    t20_pnl = @t20_pnl,
    max_drawdown = @max_drawdown,
    time_underwater = @time_underwater,
    closed = @closed,
    last_update = @last_update
`);

// Query helpers
const getDecisionsByConfidence = db.prepare(`
  SELECT 
    ROUND(confidence, 1) as confidence_bucket,
    COUNT(*) as count,
    AVG(CASE WHEN o.t1_pnl IS NOT NULL THEN o.t1_pnl ELSE 0 END) as avg_t1_pnl,
    AVG(CASE WHEN o.t5_pnl IS NOT NULL THEN o.t5_pnl ELSE 0 END) as avg_t5_pnl,
    AVG(CASE WHEN o.t20_pnl IS NOT NULL THEN o.t20_pnl ELSE 0 END) as avg_t20_pnl
  FROM decisions d
  LEFT JOIN outcomes o ON d.id = o.decision_id
  WHERE d.ts > @since
  GROUP BY confidence_bucket
  ORDER BY confidence_bucket DESC
`);

const getRecentDecisions = db.prepare(`
  SELECT d.*, o.t1_pnl, o.t5_pnl, o.t20_pnl
  FROM decisions d
  LEFT JOIN outcomes o ON d.id = o.decision_id
  ORDER BY d.ts DESC
  LIMIT @limit
`);

const getOrdersByDecision = db.prepare(`
  SELECT * FROM orders
  WHERE decision_id = @decision_id
  ORDER BY ts DESC
`);

module.exports = {
  db,
  insertDecision,
  insertOrder,
  upsertOutcome,
  getDecisionsByConfidence,
  getRecentDecisions,
  getOrdersByDecision
};