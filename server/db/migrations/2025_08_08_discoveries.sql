-- Discoveries persistence table (new schema for portfolio brain)
-- Drop existing discoveries table if it has old schema
DROP TABLE IF EXISTS discoveries;

CREATE TABLE discoveries (
    id TEXT PRIMARY KEY,
    asof TEXT NOT NULL,
    symbol TEXT NOT NULL,
    score REAL NOT NULL,
    features_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(asof, symbol)
);

-- Scoring weights table for calibration
CREATE TABLE IF NOT EXISTS scoring_weights (
    version INTEGER PRIMARY KEY,
    weights_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);