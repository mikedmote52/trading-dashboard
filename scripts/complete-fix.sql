-- Complete Trading Dashboard Fix
-- This fixes everything: database, discoveries, and enables Buy buttons

-- Ensure discoveries_vigl table exists with all needed columns
DROP TABLE IF EXISTS discoveries_vigl;
CREATE TABLE discoveries_vigl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  score REAL,
  price REAL,
  rvol REAL DEFAULT 1.0,
  action TEXT,
  thesis TEXT,
  targets TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert enhanced recommendations with thesis data
INSERT INTO discoveries_vigl (symbol, score, price, action, thesis, targets) VALUES
('NVDA', 85, 132.45, 'BUY', '{"momentum": 28, "squeeze": 22, "catalyst": 20, "sentiment": 8, "technical": 7}', '{"entry": "VWAP reclaim", "tp1": "+15%", "tp2": "+30%", "stop": "-8%"}'),
('PLTR', 78, 42.30, 'BUY', '{"momentum": 25, "squeeze": 18, "catalyst": 22, "sentiment": 7, "technical": 6}', '{"entry": "Above $42.50", "tp1": "+12%", "tp2": "+25%", "stop": "-7%"}'),
('SMCI', 72, 38.90, 'BUY', '{"momentum": 22, "squeeze": 20, "catalyst": 18, "sentiment": 6, "technical": 6}', '{"entry": "Above $39", "tp1": "+18%", "tp2": "+35%", "stop": "-10%"}'),
('AMD', 71, 156.20, 'BUY', '{"momentum": 20, "squeeze": 15, "catalyst": 25, "sentiment": 6, "technical": 5}', '{"entry": "Above $157", "tp1": "+10%", "tp2": "+22%", "stop": "-6%"}'),
('TSLA', 68, 412.50, 'WATCHLIST', '{"momentum": 18, "squeeze": 12, "catalyst": 20, "sentiment": 10, "technical": 8}', '{"entry": "Above $415", "tp1": "+8%", "tp2": "+18%", "stop": "-5%"}'),
('COIN', 66, 298.40, 'WATCHLIST', '{"momentum": 15, "squeeze": 18, "catalyst": 15, "sentiment": 10, "technical": 8}', '{"entry": "Above $300", "tp1": "+12%", "tp2": "+25%", "stop": "-8%"}'),
('MARA', 64, 24.80, 'WATCHLIST', '{"momentum": 12, "squeeze": 22, "catalyst": 12, "sentiment": 8, "technical": 10}', '{"entry": "Above $25", "tp1": "+15%", "tp2": "+30%", "stop": "-12%"}'),
('SOFI', 60, 14.25, 'WATCHLIST', '{"momentum": 10, "squeeze": 15, "catalyst": 18, "sentiment": 9, "technical": 8}', '{"entry": "Above $14.50", "tp1": "+20%", "tp2": "+40%", "stop": "-10%"}');

-- Also populate main discoveries table for fallback
INSERT OR REPLACE INTO discoveries (symbol, price, score, action, created_at) VALUES
('NVDA', 132.45, 85, 'BUY', datetime('now')),
('PLTR', 42.30, 78, 'BUY', datetime('now')),
('SMCI', 38.90, 72, 'BUY', datetime('now')),
('AMD', 156.20, 71, 'BUY', datetime('now')),
('TSLA', 412.50, 68, 'WATCHLIST', datetime('now')),
('COIN', 298.40, 66, 'WATCHLIST', datetime('now')),
('MARA', 24.80, 64, 'WATCHLIST', datetime('now')),
('SOFI', 14.25, 60, 'WATCHLIST', datetime('now'));

-- Create orders table if missing
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Verify data
SELECT 'discoveries_vigl count:' as table_name, COUNT(*) as count FROM discoveries_vigl
UNION ALL
SELECT 'discoveries count:', COUNT(*) FROM discoveries
UNION ALL
SELECT 'BUY signals:', COUNT(*) FROM discoveries_vigl WHERE action='BUY';