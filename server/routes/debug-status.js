const express = require("express");
const router = express.Router();

router.get("/v2/status", (req, res) => {
  // Provide cache + engine view for the UI header badge.
  const activeEngine = (req.app.locals?.select_engine) || process.env.SELECT_ENGINE || "v1";
  const v2Cache = req.app.locals?.v2Cache || {};
  const now = Date.now();
  const isProd = req.hostname.includes('onrender.com');
  const ttlMs = isProd ? 150000 : 60000; // 150s prod, 60s local
  const ageSec = v2Cache.updatedAt ? Math.floor((now - v2Cache.updatedAt) / 1000) : null;
  
  const payload = {
    engine: activeEngine,
    cache: {
      key: `squeeze:${activeEngine}:v2:${Math.floor(now/ttlMs)}`,
      ttlSec: Math.floor(ttlMs / 1000),
      ageSec: ageSec,
      lastSource: v2Cache.lastSource || 'unknown',
      lastUpdatedISO: v2Cache.updatedAt ? new Date(v2Cache.updatedAt).toISOString() : null,
      fresh: ageSec !== null && ageSec < (ttlMs / 1000)
    },
    lastDropReasons: v2Cache.dropReasons || {
      lowScore: 0,
      lowRvol: 0,
      lowATR: 0,
      techGateFail: 0,
      floatRuleFail: 0
    },
    filtering: {
      preFilterCount: v2Cache.preFilterCount || 0,
      postFilterCount: v2Cache.postFilterCount || 0,
      droppedCount: (v2Cache.preFilterCount || 0) - (v2Cache.postFilterCount || 0),
      minScore: 70,
      filters: ['score>=70', 'rvol>=1.5', 'atr>=4%', 'technical_gate', 'float_rule']
    },
    environment: {
      isProd: isProd,
      refreshInterval: isProd ? '150s' : '60s'
    },
    now: now
  };
  res.json(payload);
});

module.exports = router;