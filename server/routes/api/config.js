const express = require('express');
const { getConfig } = require('../../services/config');

const router = express.Router();

router.get('/', (_req, res) => {
  const config = getConfig();
  
  // Sanitized runtime values (no sensitive data)
  const sanitized = {
    engine: config.engine,
    universe_target: config.universeTarget,
    refresh_interval_ms: config.refreshMs,
    breaker_failure_threshold_5m: config.breakerFails5m,
    screener_timeout_ms: config.screenerTimeoutMs,
    screener_budget_ms: config.screenerBudgetMs,
    timestamp: new Date().toISOString()
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(sanitized);
});

module.exports = router;