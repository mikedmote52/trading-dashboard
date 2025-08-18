// Discovery Logger Service - Feature 4: Research discovery logs with PostgreSQL-compatible schema
const fs = require('fs');
const path = require('path');

class DiscoveryLogger {
  constructor() {
    this.isEnabled = process.env.DISCOVERY_LOGGING === 'true';
    
    if (this.isEnabled) {
      // Use the existing SQLite database from the main system
      const sqliteDb = require('../db/sqlite');
      this.db = sqliteDb.db;
      this.initializeDatabase();
      console.log('🔬 Discovery research logging initialized');
    } else {
      console.log('ℹ️ Discovery research logging disabled (set DISCOVERY_LOGGING=true to enable)');
    }
  }
  
  initializeDatabase() {
    try {
      this.createTables();
    } catch (error) {
      console.error('❌ Failed to initialize discovery research database:', error.message);
      this.isEnabled = false;
    }
  }
  
  createTables() {
    // PostgreSQL-compatible schema using SQLite
    const schemas = [
      // Main discovery research table
      `CREATE TABLE IF NOT EXISTS discovery_research (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        engine_version TEXT NOT NULL,
        scan_type TEXT NOT NULL,
        
        -- Discovery identification
        symbol TEXT NOT NULL,
        price REAL,
        market_cap REAL,
        sector TEXT,
        
        -- VIGL pattern analysis
        vigl_score REAL,
        vigl_confidence REAL,
        pattern_strength REAL,
        volume_factor REAL,
        momentum_score REAL,
        
        -- Technical indicators
        rsi REAL,
        macd_signal REAL,
        bollinger_position REAL,
        volume_sma_ratio REAL,
        price_sma_distance REAL,
        
        -- Short squeeze metrics
        short_interest_pct REAL,
        days_to_cover REAL,
        borrow_fee_pct REAL,
        utilization_pct REAL,
        float_shares REAL,
        
        -- Options flow
        call_put_ratio REAL,
        iv_percentile REAL,
        gamma_exposure REAL,
        max_pain REAL,
        
        -- Sentiment analysis
        social_sentiment REAL,
        news_sentiment REAL,
        analyst_rating REAL,
        reddit_mentions INTEGER,
        twitter_mentions INTEGER,
        
        -- Catalyst detection
        catalyst_type TEXT,
        catalyst_probability REAL,
        earnings_date DATE,
        event_risk REAL,
        
        -- Risk metrics
        beta REAL,
        volatility_30d REAL,
        max_drawdown REAL,
        correlation_spy REAL,
        
        -- Discovery metadata
        discovery_method TEXT,
        confidence_level TEXT,
        recommended_action TEXT,
        target_price_1 REAL,
        target_price_2 REAL,
        stop_loss_price REAL,
        
        -- Data quality indicators
        data_completeness REAL,
        estimation_flags TEXT,
        source_reliability REAL,
        last_updated DATETIME,
        
        -- Research notes
        research_notes TEXT,
        analyst_commentary TEXT,
        similar_patterns TEXT,
        
        UNIQUE(session_id, symbol)
      )`,
      
      // Discovery performance tracking
      `CREATE TABLE IF NOT EXISTS discovery_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discovery_id INTEGER REFERENCES discovery_research(id),
        tracking_date DATE NOT NULL,
        
        -- Price tracking
        current_price REAL,
        price_change_1d REAL,
        price_change_7d REAL,
        price_change_30d REAL,
        max_price_reached REAL,
        min_price_reached REAL,
        
        -- Volume tracking
        current_volume REAL,
        volume_change REAL,
        volume_spike_detected BOOLEAN,
        
        -- Technical updates
        updated_vigl_score REAL,
        updated_sentiment REAL,
        pattern_confirmation BOOLEAN,
        breakout_confirmed BOOLEAN,
        
        -- Performance metrics
        unrealized_pnl_pct REAL,
        max_favorable_move REAL,
        max_adverse_move REAL,
        
        -- Status tracking
        current_status TEXT,
        exit_reason TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Research sessions
      `CREATE TABLE IF NOT EXISTS research_sessions (
        id TEXT PRIMARY KEY,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        engine_version TEXT NOT NULL,
        scan_parameters TEXT,
        total_discoveries INTEGER DEFAULT 0,
        high_confidence_count INTEGER DEFAULT 0,
        session_notes TEXT,
        market_conditions TEXT,
        volatility_environment TEXT
      )`,
      
      // Alerts and notifications
      `CREATE TABLE IF NOT EXISTS discovery_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discovery_id INTEGER REFERENCES discovery_research(id),
        alert_type TEXT NOT NULL,
        alert_priority INTEGER,
        message TEXT NOT NULL,
        threshold_value REAL,
        current_value REAL,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_at DATETIME,
        action_taken TEXT
      )`,
      
      // Pattern library
      `CREATE TABLE IF NOT EXISTS pattern_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_name TEXT UNIQUE NOT NULL,
        pattern_description TEXT,
        success_rate REAL,
        avg_return REAL,
        avg_hold_time INTEGER,
        risk_rating TEXT,
        market_conditions TEXT,
        example_symbols TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    
    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_discovery_symbol ON discovery_research(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_discovery_timestamp ON discovery_research(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_discovery_vigl_score ON discovery_research(vigl_score)',
      'CREATE INDEX IF NOT EXISTS idx_discovery_action ON discovery_research(recommended_action)',
      'CREATE INDEX IF NOT EXISTS idx_performance_date ON discovery_performance(tracking_date)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_type ON discovery_alerts(alert_type)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_date ON research_sessions(started_at)'
    ];
    
    // Create tables and indexes
    schemas.forEach(schema => {
      this.db.exec(schema);
    });
    
    indexes.forEach(index => {
      this.db.exec(index);
    });
    
    console.log('📊 Discovery research database schema created');
  }
  
  // Start a new research session
  async startResearchSession(engineVersion, scanParameters = {}) {
    if (!this.isEnabled) return null;
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const stmt = this.db.prepare(`
        INSERT INTO research_sessions (id, engine_version, scan_parameters, market_conditions)
        VALUES (?, ?, ?, ?)
      `);
      
      const marketConditions = this.getMarketConditions();
      
      stmt.run(
        sessionId,
        engineVersion,
        JSON.stringify(scanParameters),
        JSON.stringify(marketConditions)
      );
      
      console.log(`🔬 Started research session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('❌ Error starting research session:', error.message);
      throw error;
    }
  }
  
  // Log a discovery for research
  async logDiscovery(sessionId, discovery) {
    if (!this.isEnabled) return false;
    
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO discovery_research (
          session_id, engine_version, scan_type, symbol, price, market_cap, sector,
          vigl_score, vigl_confidence, pattern_strength, volume_factor, momentum_score,
          rsi, macd_signal, bollinger_position, volume_sma_ratio, price_sma_distance,
          short_interest_pct, days_to_cover, borrow_fee_pct, utilization_pct, float_shares,
          call_put_ratio, iv_percentile, gamma_exposure, max_pain,
          social_sentiment, news_sentiment, analyst_rating, reddit_mentions, twitter_mentions,
          catalyst_type, catalyst_probability, earnings_date, event_risk,
          beta, volatility_30d, max_drawdown, correlation_spy,
          discovery_method, confidence_level, recommended_action,
          target_price_1, target_price_2, stop_loss_price,
          data_completeness, estimation_flags, source_reliability,
          research_notes, analyst_commentary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const values = [
        sessionId,
        discovery.engine_version || 'optimized',
        discovery.scan_type || 'vigl',
        discovery.symbol,
        discovery.price || null,
        discovery.market_cap || null,
        discovery.sector || null,
        discovery.vigl_score || discovery.score || null,
        discovery.vigl_confidence || discovery.confidence || null,
        discovery.pattern_strength || null,
        discovery.volume_factor || discovery.rvol || null,
        discovery.momentum_score || discovery.momentum || null,
        discovery.rsi || null,
        discovery.macd_signal || null,
        discovery.bollinger_position || null,
        discovery.volume_sma_ratio || null,
        discovery.price_sma_distance || null,
        discovery.short_interest_pct || null,
        discovery.days_to_cover || null,
        discovery.borrow_fee_pct || null,
        discovery.utilization_pct || null,
        discovery.float_shares || null,
        discovery.call_put_ratio || null,
        discovery.iv_percentile || null,
        discovery.gamma_exposure || null,
        discovery.max_pain || null,
        discovery.social_sentiment || null,
        discovery.news_sentiment || null,
        discovery.analyst_rating || null,
        discovery.reddit_mentions || null,
        discovery.twitter_mentions || null,
        discovery.catalyst_type || null,
        discovery.catalyst_probability || null,
        discovery.earnings_date || null,
        discovery.event_risk || null,
        discovery.beta || null,
        discovery.volatility_30d || null,
        discovery.max_drawdown || null,
        discovery.correlation_spy || null,
        discovery.discovery_method || 'vigl_pattern',
        discovery.confidence_level || this.getConfidenceLevel(discovery.score),
        discovery.recommended_action || discovery.action,
        discovery.target_price_1 || null,
        discovery.target_price_2 || null,
        discovery.stop_loss_price || null,
        discovery.data_completeness || 0.8,
        discovery.estimation_flags || null,
        discovery.source_reliability || 0.9,
        discovery.research_notes || null,
        discovery.analyst_commentary || null
      ];
      
      stmt.run(values, function(err) {
        if (err) {
          console.error('❌ Error logging discovery:', err.message);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
      stmt.finalize();
    });
  }
  
  // Update discovery performance
  async updatePerformance(discoveryId, performanceData) {
    if (!this.isEnabled) return false;
    
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO discovery_performance (
          discovery_id, tracking_date, current_price, price_change_1d, price_change_7d,
          price_change_30d, max_price_reached, min_price_reached, current_volume,
          volume_change, volume_spike_detected, updated_vigl_score, updated_sentiment,
          pattern_confirmation, breakout_confirmed, unrealized_pnl_pct,
          max_favorable_move, max_adverse_move, current_status, exit_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const values = [
        discoveryId,
        performanceData.tracking_date || new Date().toISOString().split('T')[0],
        performanceData.current_price,
        performanceData.price_change_1d,
        performanceData.price_change_7d || null,
        performanceData.price_change_30d || null,
        performanceData.max_price_reached || null,
        performanceData.min_price_reached || null,
        performanceData.current_volume || null,
        performanceData.volume_change || null,
        performanceData.volume_spike_detected || false,
        performanceData.updated_vigl_score || null,
        performanceData.updated_sentiment || null,
        performanceData.pattern_confirmation || false,
        performanceData.breakout_confirmed || false,
        performanceData.unrealized_pnl_pct || null,
        performanceData.max_favorable_move || null,
        performanceData.max_adverse_move || null,
        performanceData.current_status || 'active',
        performanceData.exit_reason || null
      ];
      
      stmt.run(values, function(err) {
        if (err) {
          console.error('❌ Error updating performance:', err.message);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
      stmt.finalize();
    });
  }
  
  // Create discovery alert
  async createAlert(discoveryId, alertType, message, priority = 3, thresholdValue = null, currentValue = null) {
    if (!this.isEnabled) return false;
    
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO discovery_alerts (
          discovery_id, alert_type, alert_priority, message, 
          threshold_value, current_value
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([discoveryId, alertType, priority, message, thresholdValue, currentValue], function(err) {
        if (err) {
          console.error('❌ Error creating alert:', err.message);
          reject(err);
        } else {
          console.log(`🚨 Alert created: ${alertType} for discovery ${discoveryId}`);
          resolve(this.lastID);
        }
      });
      stmt.finalize();
    });
  }
  
  // Research analytics queries
  async getDiscoveryStats(sessionId = null) {
    if (!this.isEnabled) return null;
    
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          COUNT(*) as total_discoveries,
          AVG(vigl_score) as avg_vigl_score,
          AVG(vigl_confidence) as avg_confidence,
          COUNT(CASE WHEN recommended_action = 'BUY' THEN 1 END) as buy_signals,
          COUNT(CASE WHEN recommended_action = 'WATCHLIST' THEN 1 END) as watchlist_items,
          COUNT(CASE WHEN recommended_action = 'MONITOR' THEN 1 END) as monitor_items,
          AVG(volume_factor) as avg_volume_factor,
          COUNT(CASE WHEN short_interest_pct > 20 THEN 1 END) as high_short_interest,
          COUNT(CASE WHEN data_completeness > 0.9 THEN 1 END) as high_quality_data
        FROM discovery_research
      `;
      
      if (sessionId) {
        query += ' WHERE session_id = ?';
      }
      
      this.db.get(query, sessionId ? [sessionId] : [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }
  
  async getTopPerformers(limit = 10, timeframe = '7d') {
    if (!this.isEnabled) return [];
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          dr.symbol,
          dr.vigl_score,
          dr.recommended_action,
          dr.price as entry_price,
          dp.current_price,
          dp.price_change_7d as performance,
          dp.max_favorable_move,
          dp.pattern_confirmation,
          dp.breakout_confirmed
        FROM discovery_research dr
        LEFT JOIN discovery_performance dp ON dr.id = dp.discovery_id
        WHERE dp.price_change_7d IS NOT NULL
        ORDER BY dp.price_change_7d DESC
        LIMIT ?
      `;
      
      this.db.all(query, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
  
  async getPatternAnalysis() {
    if (!this.isEnabled) return null;
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          discovery_method,
          COUNT(*) as count,
          AVG(vigl_score) as avg_score,
          AVG(vigl_confidence) as avg_confidence,
          COUNT(CASE WHEN recommended_action = 'BUY' THEN 1 END) as buy_count
        FROM discovery_research
        GROUP BY discovery_method
        ORDER BY count DESC
      `;
      
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
  
  // Helper methods
  getConfidenceLevel(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'low';
    return 'very_low';
  }
  
  getMarketConditions() {
    // Simple market conditions assessment
    return {
      timestamp: new Date().toISOString(),
      volatility: 'normal', // Could be enhanced with real VIX data
      trend: 'neutral',
      volume: 'average'
    };
  }
  
  // Close database connection
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('❌ Error closing discovery research database:', err.message);
        } else {
          console.log('🔬 Discovery research database closed');
        }
      });
    }
  }
}

module.exports = DiscoveryLogger;