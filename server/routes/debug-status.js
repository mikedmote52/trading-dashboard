const express = require("express");
const router = express.Router();

router.get("/v2/status", (req, res) => {
  // Provide cache + engine view for the UI header badge.
  const activeEngine = (req.app.locals?.select_engine) || process.env.SELECT_ENGINE || "v1";
  const cache = req.app.locals?.v2Cache || {};   // if your cache module is attached
  const payload = {
    engine: activeEngine,
    cache: {
      source: cache.lastSource || null,     // set these in your v2 scan handler
      updatedAt: cache.updatedAt || null,
      ttlMs: Number(process.env.CACHE_TTL_MS || 60000)
    },
    now: Date.now()
  };
  res.json(payload);
});

module.exports = router;