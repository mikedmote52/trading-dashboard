// Quick Discovery API - Fast access to cached results
const express = require('express');
const router = express.Router();

// Simple cache for quick access
let cachedDiscoveries = [];
let lastUpdate = 0;

// GET /api/quick-discovery - Fast cached discovery results
router.get('/', async (req, res) => {
  try {
    // Check if we have recent cached data (within 5 minutes)
    const now = Date.now();
    const cacheAge = now - lastUpdate;
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    if (cacheAge < CACHE_TTL && cachedDiscoveries.length > 0) {
      return res.json({
        success: true,
        items: cachedDiscoveries,
        cached: true,
        age_seconds: Math.round(cacheAge / 1000),
        count: cachedDiscoveries.length
      });
    }
    
    // Try to get from V2 cache
    try {
      const cache = require('../../src/screener/v2/cache');
      const snapshot = cache.getSnapshot();
      
      if (snapshot.fresh && snapshot.tickers && snapshot.tickers.length > 0) {
        // Transform cached data to discovery format - NO MOCK DATA
        cachedDiscoveries = snapshot.tickers.slice(0, 12).map((ticker, index) => ({
          symbol: ticker.symbol || ticker,
          score: ticker.score || 0,
          price: ticker.price || 0,
          rel_vol_30m: ticker.rel_vol_30m || ticker.rvol || 0,
          action: ticker.action || 'MONITOR',
          thesis: ticker.thesis || `AlphaStack VIGL candidate - Score: ${ticker.score || 0}`,
          target_price: ticker.target_price || 0,
          upside_pct: ticker.upside_pct || 0,
          volume_spike: ticker.rel_vol_30m || 0,
          momentum: ticker.momentum || 'Unknown'
        }));
        
        lastUpdate = now;
        
        return res.json({
          success: true,
          items: cachedDiscoveries,
          cached: false,
          source: 'v2_cache',
          count: cachedDiscoveries.length
        });
      }
    } catch (cacheError) {
      console.log('Cache access failed, using fallback');
    }
    
    // No fallback mock data - return empty if no real data available
    res.json({
      success: false,
      items: [],
      cached: false,
      source: 'no_data',
      count: 0,
      message: 'No discovery data available - use /api/discoveries/latest for real AlphaStack VIGL results'
    });
    
  } catch (error) {
    console.error('Quick discovery error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      items: []
    });
  }
});

module.exports = router;