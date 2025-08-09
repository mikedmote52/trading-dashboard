const express = require('express');
const router = express.Router();
const db = require('../db/sqlite');
const { createDeduplicationMiddleware } = require('../utils/deduplicateDiscoveries');

// GET /api/discoveries/top - Get today's top discoveries
router.get('/top', async (req, res) => {
  try {
    const discoveries = await db.getTodaysDiscoveries();
    
    // Transform to match UI expectations
    const formatted = discoveries.map(d => {
      const features = JSON.parse(d.features_json || '{}');
      return {
        symbol: d.symbol,
        name: features.name || d.symbol,
        currentPrice: features.current_price || features.price || 50,
        marketCap: features.market_cap || 100000000,
        volumeSpike: features.rel_volume || 1.0,
        momentum: (features.momentum_5d || 0) * 100, // Convert to percentage
        breakoutStrength: Math.min(d.score / 5.0, 1.0),
        sector: features.sector || 'Technology',
        catalysts: features.catalyst_flag ? ['Catalyst detected'] : ['Pattern match'],
        similarity: Math.min(d.score / 5.0, 1.0),
        confidence: Math.min(d.score / 5.0, 1.0),
        isHighConfidence: d.score >= 4.0,
        estimatedUpside: d.score >= 4.0 ? '100-200%' : '50-100%',
        discoveredAt: d.created_at,
        riskLevel: d.score >= 3.5 ? 'MODERATE' : 'HIGH',
        recommendation: d.score >= 4.0 ? 'STRONG BUY' : 'BUY',
        viglScore: Math.min(d.score / 5.0, 1.0)  // For UI scaling
      };
    });
    
    // Apply deduplication to the formatted data
    const { processDiscoveries } = require('../utils/deduplicateDiscoveries');
    const deduplicationResult = processDiscoveries(formatted, {
      enableSymbolDeduplication: true,
      enableNearDuplicateFiltering: false,
      enableQualityFilter: true,
      qualityThresholds: {
        minScore: 1.0,           // Lower threshold for more discoveries
        minVolumeSpike: 1.0,     // Lower threshold for more discoveries  
        minPrice: 0.01,
        maxPrice: 10000
      }
    });
    
    res.json({
      success: true,
      count: deduplicationResult.discoveries.length,
      discoveries: deduplicationResult.discoveries,
      deduplication: {
        stats: deduplicationResult.stats,
        reductionPercentage: deduplicationResult.reductionPercentage
      }
    });
  } catch (error) {
    console.error('Error fetching discoveries:', error);
    res.json({
      success: false,
      error: error.message,
      discoveries: []
    });
  }
});

// GET /api/discoveries/latest - Get most recent discoveries
router.get('/latest', async (req, res) => {
  try {
    const discoveries = await db.getLatestDiscoveries(10); // Top 10
    res.json({
      success: true,
      discoveries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/discoveries/scan - Trigger a discovery scan
router.post('/scan', async (req, res) => {
  try {
    const capture = require('../jobs/capture');
    
    // Run capture job immediately
    console.log('🔍 Manual discovery scan triggered');
    await capture.runDiscoveryCapture();
    
    // Fetch fresh results
    const discoveries = await db.getTodaysDiscoveries();
    
    res.json({
      success: true,
      message: 'Discovery scan completed',
      count: discoveries.length,
      discoveries: discoveries.slice(0, 5) // Return top 5
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;