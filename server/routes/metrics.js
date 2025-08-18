// Metrics API Routes - Feature 3: Prometheus monitoring endpoints
const express = require('express');
const router = express.Router();

// GET /metrics - Prometheus metrics endpoint
router.get('/', (req, res) => {
  try {
    if (!req.app.locals.metricsService) {
      return res.status(503).text('Metrics service not available');
    }
    
    const prometheusMetrics = req.app.locals.metricsService.exportPrometheusMetrics();
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(prometheusMetrics);
    
  } catch (error) {
    console.error('❌ Metrics export error:', error.message);
    res.status(500).text(`# Error exporting metrics: ${error.message}`);
  }
});

// GET /metrics/json - JSON format for debugging
router.get('/json', (req, res) => {
  try {
    if (!req.app.locals.metricsService) {
      return res.status(503).json({ error: 'Metrics service not available' });
    }
    
    const jsonMetrics = req.app.locals.metricsService.getMetricsJSON();
    res.json(jsonMetrics);
    
  } catch (error) {
    console.error('❌ JSON metrics error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /metrics/health - Health check with key metrics
router.get('/health', (req, res) => {
  try {
    if (!req.app.locals.metricsService) {
      return res.status(503).json({ 
        healthy: false, 
        error: 'Metrics service not available' 
      });
    }
    
    const metricsService = req.app.locals.metricsService;
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Get some key metrics
    const httpRequestsTotal = metricsService.counters.get('http_requests_total')?.value || 0;
    const tradesTotal = metricsService.counters.get('trades_total')?.value || 0;
    const discoveriesTotal = metricsService.counters.get('discoveries_total')?.value || 0;
    const avgDiscoveryScore = metricsService.gauges.get('discovery_score_avg')?.value || 0;
    
    res.json({
      healthy: true,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      metrics: {
        httpRequestsTotal,
        tradesTotal,
        discoveriesTotal,
        avgDiscoveryScore: Math.round(avgDiscoveryScore * 100) / 100
      }
    });
    
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    res.status(500).json({ 
      healthy: false, 
      error: error.message 
    });
  }
});

// POST /metrics/track/:type - Manual metric tracking endpoint
router.post('/track/:type', (req, res) => {
  try {
    if (!req.app.locals.metricsService) {
      return res.status(503).json({ error: 'Metrics service not available' });
    }
    
    const metricsService = req.app.locals.metricsService;
    const { type } = req.params;
    const { name, value, labels = {} } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Metric name required' });
    }
    
    switch (type) {
      case 'counter':
        metricsService.incrementCounter(name, labels);
        break;
        
      case 'gauge':
        if (value === undefined) {
          return res.status(400).json({ error: 'Value required for gauge metrics' });
        }
        metricsService.setGauge(name, value, labels);
        break;
        
      case 'histogram':
        if (value === undefined) {
          return res.status(400).json({ error: 'Value required for histogram metrics' });
        }
        metricsService.observeHistogram(name, value, labels);
        break;
        
      default:
        return res.status(400).json({ error: `Unknown metric type: ${type}` });
    }
    
    res.json({ 
      success: true, 
      type, 
      name, 
      value, 
      labels,
      timestamp: new Date().toISOString() 
    });
    
  } catch (error) {
    console.error('❌ Manual tracking error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;