// Simple Discovery Logger Service - Feature 4: Research discovery logs
class SimpleDiscoveryLogger {
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
      // Simple research tables using better-sqlite3 API
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS research_sessions (
          id TEXT PRIMARY KEY,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ended_at DATETIME,
          engine_version TEXT NOT NULL,
          scan_parameters TEXT,
          total_discoveries INTEGER DEFAULT 0,
          session_notes TEXT
        )
      `);
      
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS research_discoveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          symbol TEXT NOT NULL,
          price REAL,
          vigl_score REAL,
          vigl_confidence REAL,
          volume_factor REAL,
          recommended_action TEXT,
          discovery_method TEXT,
          research_notes TEXT,
          target_price_1 REAL,
          target_price_2 REAL,
          stop_loss_price REAL,
          FOREIGN KEY (session_id) REFERENCES research_sessions(id)
        )
      `);
      
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS research_performance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discovery_id INTEGER NOT NULL,
          tracking_date DATE NOT NULL,
          current_price REAL,
          price_change_1d REAL,
          price_change_7d REAL,
          unrealized_pnl_pct REAL,
          pattern_confirmed BOOLEAN DEFAULT FALSE,
          current_status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (discovery_id) REFERENCES research_discoveries(id)
        )
      `);
      
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS research_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          discovery_id INTEGER NOT NULL,
          alert_type TEXT NOT NULL,
          message TEXT NOT NULL,
          priority INTEGER DEFAULT 3,
          threshold_value REAL,
          current_value REAL,
          triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          acknowledged BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (discovery_id) REFERENCES research_discoveries(id)
        )
      `);
      
      // Create indexes
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_research_symbol ON research_discoveries(symbol)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_research_timestamp ON research_discoveries(timestamp)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_research_score ON research_discoveries(vigl_score)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_performance_date ON research_performance(tracking_date)`);
      
      console.log('📊 Discovery research database schema ready');
    } catch (error) {
      console.error('❌ Failed to initialize discovery research database:', error.message);
      this.isEnabled = false;
    }
  }
  
  // Start a new research session
  startResearchSession(engineVersion, scanParameters = {}) {
    if (!this.isEnabled) return null;
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const stmt = this.db.prepare(`
        INSERT INTO research_sessions (id, engine_version, scan_parameters)
        VALUES (?, ?, ?)
      `);
      
      stmt.run(sessionId, engineVersion, JSON.stringify(scanParameters));
      
      console.log(`🔬 Started research session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('❌ Error starting research session:', error.message);
      throw error;
    }
  }
  
  // Log a discovery for research
  logDiscovery(sessionId, discovery) {
    if (!this.isEnabled) return false;
    
    try {
      const stmt = this.db.prepare(`
        INSERT INTO research_discoveries (
          session_id, symbol, price, vigl_score, vigl_confidence, volume_factor,
          recommended_action, discovery_method, research_notes, target_price_1,
          target_price_2, stop_loss_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        sessionId,
        discovery.symbol,
        discovery.price || null,
        discovery.vigl_score || discovery.score || null,
        discovery.vigl_confidence || discovery.confidence || null,
        discovery.volume_factor || discovery.rvol || null,
        discovery.recommended_action || discovery.action || null,
        discovery.discovery_method || 'vigl_pattern',
        discovery.research_notes || null,
        discovery.target_price_1 || null,
        discovery.target_price_2 || null,
        discovery.stop_loss_price || null
      );
      
      console.log(`🔬 Logged discovery: ${discovery.symbol} (ID: ${result.lastInsertRowid})`);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('❌ Error logging discovery:', error.message);
      throw error;
    }
  }
  
  // Update discovery performance
  updatePerformance(discoveryId, performanceData) {
    if (!this.isEnabled) return false;
    
    try {
      const stmt = this.db.prepare(`
        INSERT INTO research_performance (
          discovery_id, tracking_date, current_price, price_change_1d,
          price_change_7d, unrealized_pnl_pct, pattern_confirmed, current_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        discoveryId,
        performanceData.tracking_date || new Date().toISOString().split('T')[0],
        performanceData.current_price || null,
        performanceData.price_change_1d || null,
        performanceData.price_change_7d || null,
        performanceData.unrealized_pnl_pct || null,
        performanceData.pattern_confirmed || false,
        performanceData.current_status || 'active'
      );
      
      return result.lastInsertRowid;
    } catch (error) {
      console.error('❌ Error updating performance:', error.message);
      throw error;
    }
  }
  
  // Create discovery alert
  createAlert(discoveryId, alertType, message, priority = 3, thresholdValue = null, currentValue = null) {
    if (!this.isEnabled) return false;
    
    try {
      const stmt = this.db.prepare(`
        INSERT INTO research_alerts (
          discovery_id, alert_type, message, priority, threshold_value, current_value
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(discoveryId, alertType, message, priority, thresholdValue, currentValue);
      
      console.log(`🚨 Alert created: ${alertType} for discovery ${discoveryId}`);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('❌ Error creating alert:', error.message);
      throw error;
    }
  }
  
  // Get discovery statistics
  getDiscoveryStats(sessionId = null) {
    if (!this.isEnabled) return null;
    
    try {
      let query = `
        SELECT 
          COUNT(*) as total_discoveries,
          AVG(vigl_score) as avg_vigl_score,
          AVG(vigl_confidence) as avg_confidence,
          COUNT(CASE WHEN recommended_action = 'BUY' THEN 1 END) as buy_signals,
          COUNT(CASE WHEN recommended_action = 'WATCHLIST' THEN 1 END) as watchlist_items,
          COUNT(CASE WHEN recommended_action = 'MONITOR' THEN 1 END) as monitor_items,
          AVG(volume_factor) as avg_volume_factor
        FROM research_discoveries
      `;
      
      if (sessionId) {
        query += ' WHERE session_id = ?';
        return this.db.prepare(query).get(sessionId);
      } else {
        return this.db.prepare(query).get();
      }
    } catch (error) {
      console.error('❌ Error getting discovery stats:', error.message);
      return null;
    }
  }
  
  // Get top performers
  getTopPerformers(limit = 10) {
    if (!this.isEnabled) return [];
    
    try {
      const query = `
        SELECT 
          rd.symbol,
          rd.vigl_score,
          rd.recommended_action,
          rd.price as entry_price,
          rp.current_price,
          rp.price_change_7d as performance,
          rp.pattern_confirmed
        FROM research_discoveries rd
        LEFT JOIN research_performance rp ON rd.id = rp.discovery_id
        WHERE rp.price_change_7d IS NOT NULL
        ORDER BY rp.price_change_7d DESC
        LIMIT ?
      `;
      
      return this.db.prepare(query).all(limit);
    } catch (error) {
      console.error('❌ Error getting top performers:', error.message);
      return [];
    }
  }
  
  // Get pattern analysis
  getPatternAnalysis() {
    if (!this.isEnabled) return [];
    
    try {
      const query = `
        SELECT 
          discovery_method,
          COUNT(*) as count,
          AVG(vigl_score) as avg_score,
          AVG(vigl_confidence) as avg_confidence,
          COUNT(CASE WHEN recommended_action = 'BUY' THEN 1 END) as buy_count
        FROM research_discoveries
        GROUP BY discovery_method
        ORDER BY count DESC
      `;
      
      return this.db.prepare(query).all();
    } catch (error) {
      console.error('❌ Error getting pattern analysis:', error.message);
      return [];
    }
  }
  
  // Get discoveries with filtering
  getDiscoveries(filters = {}) {
    if (!this.isEnabled) return [];
    
    try {
      let whereConditions = [];
      let params = [];
      
      if (filters.session_id) {
        whereConditions.push('session_id = ?');
        params.push(filters.session_id);
      }
      
      if (filters.symbol) {
        whereConditions.push('symbol = ?');
        params.push(filters.symbol);
      }
      
      if (filters.action) {
        whereConditions.push('recommended_action = ?');
        params.push(filters.action);
      }
      
      if (filters.min_score) {
        whereConditions.push('vigl_score >= ?');
        params.push(parseFloat(filters.min_score));
      }
      
      const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
      const sortBy = filters.sort_by || 'timestamp';
      const sortOrder = filters.sort_order || 'DESC';
      const limit = parseInt(filters.limit) || 50;
      
      const query = `
        SELECT 
          id, session_id, timestamp, symbol, price, vigl_score, vigl_confidence,
          volume_factor, recommended_action, discovery_method, research_notes,
          target_price_1, target_price_2, stop_loss_price
        FROM research_discoveries
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT ?
      `;
      
      params.push(limit);
      return this.db.prepare(query).all(...params);
    } catch (error) {
      console.error('❌ Error getting discoveries:', error.message);
      return [];
    }
  }
  
  // Get performance history for a discovery
  getPerformanceHistory(discoveryId) {
    if (!this.isEnabled) return [];
    
    try {
      const query = `
        SELECT * FROM research_performance
        WHERE discovery_id = ?
        ORDER BY tracking_date DESC
      `;
      
      return this.db.prepare(query).all(discoveryId);
    } catch (error) {
      console.error('❌ Error getting performance history:', error.message);
      return [];
    }
  }
  
  // Export discoveries data
  exportDiscoveries(sessionId = null) {
    if (!this.isEnabled) return [];
    
    try {
      let query = `
        SELECT rd.*, 
               GROUP_CONCAT(rp.tracking_date || ':' || rp.current_price) as price_history
        FROM research_discoveries rd
        LEFT JOIN research_performance rp ON rd.id = rp.discovery_id
      `;
      
      let params = [];
      if (sessionId) {
        query += ' WHERE rd.session_id = ?';
        params.push(sessionId);
      }
      
      query += ' GROUP BY rd.id ORDER BY rd.timestamp DESC';
      
      return this.db.prepare(query).all(...params);
    } catch (error) {
      console.error('❌ Error exporting discoveries:', error.message);
      return [];
    }
  }
}

module.exports = SimpleDiscoveryLogger;