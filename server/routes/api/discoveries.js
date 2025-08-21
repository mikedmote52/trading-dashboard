const express = require("express");
const { getCache, forceRefresh } = require("../../services/alphastack/screener_runner");

const router = express.Router();

router.get("/latest", (req, res) => {
  try {
    const { items, updatedAt, running, error, fresh } = getCache();
    const limit = Number(req.query.limit || 50);
    
    res.json({ 
      items: items.slice(0, limit), 
      updatedAt, 
      running, 
      error, 
      fresh,
      success: true,
      count: items.length,
      source: 'alphastack_vigl'
    });
  } catch (err) {
    console.error('❌ Discoveries API error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      items: [],
      running: false,
      fresh: false,
      count: 0
    });
  }
});

router.post("/refresh", (req, res) => {
  try {
    const { updatedAt } = getCache();
    const refreshed = forceRefresh();
    
    res.json({ 
      ok: true, 
      lastUpdated: updatedAt,
      refreshTriggered: refreshed
    });
  } catch (err) {
    console.error('❌ Discoveries refresh error:', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  const { items, updatedAt, running, error, fresh } = getCache();
  
  res.json({
    healthy: !error && (fresh || running),
    itemCount: items.length,
    lastUpdate: new Date(updatedAt).toISOString(),
    running,
    fresh,
    error,
    cacheAge: Date.now() - updatedAt
  });
});

module.exports = router;