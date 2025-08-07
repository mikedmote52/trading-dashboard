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

-- =====================================================
-- PORTFOLIO MANAGEMENT TABLES
-- =====================================================

-- Table for portfolio alerts
CREATE TABLE IF NOT EXISTS portfolio_alerts (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    current_price DECIMAL(10, 4),
    entry_price DECIMAL(10, 4),
    pnl_percent DECIMAL(8, 2),
    market_value DECIMAL(12, 2),
    position_weight DECIMAL(5, 2),
    days_held INTEGER,
    risk_score DECIMAL(4, 3),
    action VARCHAR(20),  -- HOLD, SELL, REDUCE, TAKE_PROFIT, TRAIL_STOP
    alert_level VARCHAR(20),  -- CRITICAL, WARNING, OPPORTUNITY, INFO
    message TEXT,
    thesis_status VARCHAR(30),  -- EXCEEDING_THESIS, ON_TRACK, UNDERPERFORMING, NO_THESIS
    session_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_symbol_time ON portfolio_alerts (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_alert_level ON portfolio_alerts (alert_level);
CREATE INDEX IF NOT EXISTS idx_portfolio_session ON portfolio_alerts (session_id);

-- Table for portfolio health summary
CREATE TABLE IF NOT EXISTS portfolio_health (
    id SERIAL PRIMARY KEY,
    session_id UUID,
    total_positions INTEGER,
    total_value DECIMAL(12, 2),
    average_pnl_percent DECIMAL(8, 2),
    high_risk_positions INTEGER,
    sell_signals INTEGER,
    profit_signals INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- View for latest portfolio alerts (last analysis)
CREATE OR REPLACE VIEW latest_portfolio_alerts AS
SELECT DISTINCT ON (symbol) 
    symbol, current_price, entry_price, pnl_percent,
    market_value, position_weight, days_held,
    risk_score, action, alert_level, message,
    thesis_status, created_at
FROM portfolio_alerts 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY symbol, created_at DESC;

-- View for critical portfolio alerts
CREATE OR REPLACE VIEW critical_portfolio_alerts AS
SELECT * FROM latest_portfolio_alerts
WHERE alert_level IN ('CRITICAL', 'WARNING', 'OPPORTUNITY')
ORDER BY 
    CASE alert_level 
        WHEN 'CRITICAL' THEN 1
        WHEN 'WARNING' THEN 2
        WHEN 'OPPORTUNITY' THEN 3
    END,
    risk_score DESC;