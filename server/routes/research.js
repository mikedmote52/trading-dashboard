// Discovery Research API Routes - Feature 4: PostgreSQL-compatible research logging
const express = require('express');
const router = express.Router();

// GET /api/research/stats - Research statistics
router.get('/stats', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled',
        note: 'Set DISCOVERY_LOGGING=true to enable research features'
      });
    }
    
    const { session_id } = req.query;
    const logger = req.app.locals.discoveryLogger;
    
    const stats = await logger.getDiscoveryStats(session_id);
    const patternAnalysis = await logger.getPatternAnalysis();
    const topPerformers = await logger.getTopPerformers(5);
    
    res.json({
      success: true,
      session_id: session_id || 'all',
      stats,
      patterns: patternAnalysis,
      top_performers: topPerformers,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Research stats error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/research/session/start - Start new research session
router.post('/session/start', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled'
      });
    }
    
    const { engine_version = 'optimized', scan_parameters = {} } = req.body;
    const logger = req.app.locals.discoveryLogger;
    
    const sessionId = await logger.startResearchSession(engine_version, scan_parameters);
    
    console.log(`🔬 Started research session: ${sessionId}`);
    
    res.json({
      success: true,
      session_id: sessionId,
      engine_version,
      scan_parameters,
      started_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Research session start error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/research/log - Log discovery for research
router.post('/log', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled'
      });
    }
    
    const { session_id, discovery } = req.body;
    
    if (!session_id || !discovery) {
      return res.status(400).json({
        success: false,
        error: 'session_id and discovery data required'
      });
    }
    
    if (!discovery.symbol) {
      return res.status(400).json({
        success: false,
        error: 'discovery.symbol is required'
      });
    }
    
    const logger = req.app.locals.discoveryLogger;
    const discoveryId = await logger.logDiscovery(session_id, discovery);
    
    console.log(`🔬 Logged discovery: ${discovery.symbol} (ID: ${discoveryId})`);
    
    res.json({
      success: true,
      discovery_id: discoveryId,
      session_id,
      symbol: discovery.symbol,
      logged_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Discovery logging error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/research/performance - Update discovery performance
router.post('/performance', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled'
      });
    }
    
    const { discovery_id, performance_data } = req.body;
    
    if (!discovery_id || !performance_data) {
      return res.status(400).json({
        success: false,
        error: 'discovery_id and performance_data required'
      });
    }
    
    const logger = req.app.locals.discoveryLogger;
    const performanceId = await logger.updatePerformance(discovery_id, performance_data);
    
    res.json({
      success: true,
      performance_id: performanceId,
      discovery_id,
      updated_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Performance update error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/research/alert - Create discovery alert
router.post('/alert', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled'
      });
    }
    
    const { 
      discovery_id, 
      alert_type, 
      message, 
      priority = 3, 
      threshold_value = null, 
      current_value = null 
    } = req.body;
    
    if (!discovery_id || !alert_type || !message) {
      return res.status(400).json({
        success: false,
        error: 'discovery_id, alert_type, and message are required'
      });
    }
    
    const logger = req.app.locals.discoveryLogger;
    const alertId = await logger.createAlert(
      discovery_id, 
      alert_type, 
      message, 
      priority, 
      threshold_value, 
      current_value
    );
    
    res.json({
      success: true,
      alert_id: alertId,
      discovery_id,
      alert_type,
      created_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Alert creation error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/research/discoveries - Get research discoveries with filtering
router.get('/discoveries', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled'
      });
    }
    
    const {
      session_id,
      symbol,
      action,
      min_score = 0,
      limit = 50,
      sort_by = 'timestamp',
      sort_order = 'DESC'
    } = req.query;
    
    const logger = req.app.locals.discoveryLogger;
    
    // Build dynamic query
    let whereConditions = [];
    let params = [];
    
    if (session_id) {
      whereConditions.push('session_id = ?');
      params.push(session_id);
    }
    
    if (symbol) {
      whereConditions.push('symbol = ?');
      params.push(symbol);
    }
    
    if (action) {
      whereConditions.push('recommended_action = ?');
      params.push(action);
    }
    
    whereConditions.push('vigl_score >= ?');
    params.push(parseFloat(min_score));
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    const query = `
      SELECT 
        id, session_id, timestamp, symbol, price, vigl_score, vigl_confidence,
        volume_factor, recommended_action, confidence_level, discovery_method,
        target_price_1, target_price_2, stop_loss_price, research_notes
      FROM discovery_research
      ${whereClause}
      ORDER BY ${sort_by} ${sort_order}
      LIMIT ?
    `;
    
    params.push(parseInt(limit));
    
    const discoveries = await new Promise((resolve, reject) => {
      logger.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      discoveries,
      count: discoveries.length,
      filters: {
        session_id,
        symbol,
        action,
        min_score,
        sort_by,
        sort_order
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Get discoveries error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/research/performance/:discovery_id - Get performance history
router.get('/performance/:discovery_id', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled'
      });
    }
    
    const { discovery_id } = req.params;
    const logger = req.app.locals.discoveryLogger;
    
    const query = `
      SELECT * FROM discovery_performance
      WHERE discovery_id = ?
      ORDER BY tracking_date DESC
    `;
    
    const performance = await new Promise((resolve, reject) => {
      logger.db.all(query, [discovery_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      discovery_id,
      performance_history: performance,
      count: performance.length
    });
    
  } catch (error) {
    console.error('❌ Get performance error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/research/export - Export research data
router.get('/export', async (req, res) => {
  try {
    if (!req.app.locals.discoveryLogger || !req.app.locals.discoveryLogger.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Discovery research logging not enabled'
      });
    }
    
    const { session_id, format = 'json' } = req.query;
    const logger = req.app.locals.discoveryLogger;
    
    let query = `
      SELECT dr.*, 
             GROUP_CONCAT(dp.tracking_date || ':' || dp.current_price) as price_history
      FROM discovery_research dr
      LEFT JOIN discovery_performance dp ON dr.id = dp.discovery_id
    `;
    
    let params = [];
    if (session_id) {
      query += ' WHERE dr.session_id = ?';
      params.push(session_id);
    }
    
    query += ' GROUP BY dr.id ORDER BY dr.timestamp DESC';
    
    const data = await new Promise((resolve, reject) => {
      logger.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (format === 'csv') {
      // Simple CSV export
      const csv = [
        'timestamp,symbol,vigl_score,action,price,confidence,volume_factor,notes',
        ...data.map(row => 
          `${row.timestamp},${row.symbol},${row.vigl_score},${row.recommended_action},${row.price},${row.vigl_confidence},${row.volume_factor},"${row.research_notes || ''}"`
        )
      ].join('\n');
      
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="discovery_research_${session_id || 'all'}_${new Date().toISOString().split('T')[0]}.csv"`
      });
      
      res.send(csv);
    } else {
      res.json({
        success: true,
        export_format: format,
        session_id: session_id || 'all',
        data,
        count: data.length,
        exported_at: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Export error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;