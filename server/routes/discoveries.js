const express = require('express');
const router = express.Router();
const { getLatestBundle, getBundleById } = require('../db/discoveries');
const { runVIGLScan } = require('../workers/vigl_worker');

/**
 * GET /api/discoveries/latest
 * Returns the most recent discovery bundle
 */
router.get('/latest', (req, res) => {
  try {
    const bundle = getLatestBundle();
    
    if (!bundle) {
      return res.status(404).json({ 
        error: 'No discovery runs found',
        message: 'Please run a scan first'
      });
    }
    
    // Transform for API response
    const response = {
      run: {
        run_id: bundle.run.run_id,
        created_at: bundle.run.created_at,
        scanner_version: bundle.run.scanner_version,
        input_signature: bundle.run.input_signature,
        source_window: bundle.run.source_window,
        note: bundle.run.note
      },
      items: bundle.items.map(item => ({
        rank: item.rank,
        symbol: item.symbol,
        name: item.name,
        confidence: item.confidence,
        momentum: item.momentum,
        volume_spike: item.volume_spike,
        risk: item.risk,
        features: item.features ? JSON.parse(item.features) : {}
      }))
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching latest discoveries:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * GET /api/discoveries/:run_id
 * Returns a specific discovery bundle
 */
router.get('/:run_id', (req, res) => {
  try {
    const { run_id } = req.params;
    const bundle = getBundleById(run_id);
    
    if (!bundle) {
      return res.status(404).json({ 
        error: 'Discovery run not found',
        run_id 
      });
    }
    
    // Transform for API response
    const response = {
      run: {
        run_id: bundle.run.run_id,
        created_at: bundle.run.created_at,
        scanner_version: bundle.run.scanner_version,
        input_signature: bundle.run.input_signature,
        source_window: bundle.run.source_window,
        note: bundle.run.note
      },
      items: bundle.items.map(item => ({
        rank: item.rank,
        symbol: item.symbol,
        name: item.name,
        confidence: item.confidence,
        momentum: item.momentum,
        volume_spike: item.volume_spike,
        risk: item.risk,
        features: item.features ? JSON.parse(item.features) : {}
      }))
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching discovery run:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * POST /api/discoveries/scan
 * Enqueue a fresh discovery scan
 */
router.post('/scan', async (req, res) => {
  try {
    const { runMode, ...params } = req.body;
    
    if (runMode === 'sync') {
      // Synchronous mode - wait for completion
      const result = await runVIGLScan(params);
      res.json(result);
    } else {
      // Asynchronous mode - queue and return immediately
      runVIGLScan(params)
        .then(result => {
          console.log('VIGL scan completed:', result);
        })
        .catch(error => {
          console.error('VIGL scan failed:', error);
        });
      
      res.json({ 
        status: 'queued',
        message: 'Discovery scan has been queued'
      });
    }
  } catch (error) {
    // Check for rate limiting
    if (error.message.includes('Rate limited')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: error.message 
      });
    }
    
    console.error('Error starting discovery scan:', error);
    res.status(500).json({ 
      error: 'Failed to start scan',
      message: error.message 
    });
  }
});

module.exports = router;