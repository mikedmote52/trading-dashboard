-- VIGL Discovery Database Schema
-- This creates tables for storing real-time VIGL pattern discoveries

CREATE TABLE IF NOT EXISTS vigl_discoveries (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    company_name VARCHAR(255),
    current_price DECIMAL(10, 4),
    market_cap BIGINT,
    volume_spike_ratio DECIMAL(8, 2),
    momentum DECIMAL(8, 2),
    pattern_strength DECIMAL(4, 3),
    sector VARCHAR(100),
    catalysts TEXT[],
    vigl_similarity DECIMAL(4, 3),
    confidence_score DECIMAL(4, 3),
    is_high_confidence BOOLEAN,
    estimated_upside VARCHAR(20),
    risk_level VARCHAR(20),
    recommendation VARCHAR(20),
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scan_session_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by symbol and timestamp
CREATE INDEX IF NOT EXISTS idx_vigl_symbol_time ON vigl_discoveries (symbol, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_vigl_confidence ON vigl_discoveries (confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_vigl_session ON vigl_discoveries (scan_session_id);

-- Table for tracking scan sessions
CREATE TABLE IF NOT EXISTS scan_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    total_stocks_scanned INTEGER,
    patterns_found INTEGER,
    status VARCHAR(20) DEFAULT 'running',
    error_message TEXT
);

-- View for latest discoveries (last 24 hours)
CREATE OR REPLACE VIEW latest_vigl_discoveries AS
SELECT DISTINCT ON (symbol) 
    symbol,
    company_name,
    current_price,
    market_cap,
    volume_spike_ratio,
    momentum,
    pattern_strength,
    sector,
    catalysts,
    vigl_similarity,
    confidence_score,
    is_high_confidence,
    estimated_upside,
    risk_level,
    recommendation,
    discovered_at
FROM vigl_discoveries 
WHERE discovered_at > NOW() - INTERVAL '24 hours'
  AND confidence_score >= 0.6
ORDER BY symbol, discovered_at DESC;

-- View for top patterns (high confidence)
CREATE OR REPLACE VIEW top_vigl_patterns AS
SELECT * FROM latest_vigl_discoveries
WHERE confidence_score >= 0.8
ORDER BY confidence_score DESC, volume_spike_ratio DESC;