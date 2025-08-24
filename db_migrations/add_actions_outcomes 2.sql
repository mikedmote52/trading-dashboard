-- Database migrations for unified engine
-- Actions and outcomes tracking for learning system

-- Actions table - stores all trading recommendations
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY_MORE', 'HOLD', 'TRIM', 'SELL')),
  add_usd INTEGER,
  reason_codes TEXT, -- JSON array of reason codes
  confidence REAL,
  urgency TEXT DEFAULT 'LOW',
  suggested_amount TEXT,
  score REAL,
  pnl_pct REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Outcomes table - stores realized trading results
CREATE TABLE IF NOT EXISTS outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,
  forward_20m REAL, -- Price change 20 minutes after action
  forward_1h REAL,  -- Price change 1 hour after action
  stop_hit INTEGER DEFAULT 0,  -- 1 if stop loss was hit
  tp1_hit INTEGER DEFAULT 0,   -- 1 if first take profit was hit
  tp2_hit INTEGER DEFAULT 0,   -- 1 if second take profit was hit
  context TEXT,     -- Additional context (JSON)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Feedback table - stores user overrides and feedback
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  action_suggested TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  user_override INTEGER GENERATED ALWAYS AS (action_suggested != action_taken) STORED,
  context TEXT,     -- Additional context (JSON)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Ticker rules table - stores per-ticker TP/SL settings
CREATE TABLE IF NOT EXISTS ticker_rules (
  ticker TEXT PRIMARY KEY,
  tp1_pct REAL NOT NULL DEFAULT 0.15,
  tp2_pct REAL NOT NULL DEFAULT 0.50,
  stop_pct REAL NOT NULL DEFAULT 0.10,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_actions_ticker ON actions(ticker);
CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at);
CREATE INDEX IF NOT EXISTS idx_outcomes_ticker ON outcomes(ticker);
CREATE INDEX IF NOT EXISTS idx_outcomes_created_at ON outcomes(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_ticker ON feedback(ticker);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);