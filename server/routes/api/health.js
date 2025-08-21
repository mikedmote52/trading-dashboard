const express = require('express');
const { getRefresherState } = require('../../worker/discoveryRefresher');
const { getState: getBreakerState } = require('../../services/circuitBreaker');
const { getSourceMixLastHour } = require('../../services/sourceMix');

const router = express.Router();

router.get('/discovery', async (_req, res) => {
  const { lastSuccessTs, lastErrorTs, failCount } = getRefresherState();
  const now = Date.now();
  const age = lastSuccessTs ? now - lastSuccessTs : Infinity;
  
  let status = 'down';
  if (age <= 90_000) status = 'ok';
  else if (age <= 300_000) status = 'degraded';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status,
    breaker: getBreakerState(),
    last_success_ts: lastSuccessTs || null,
    last_error_ts: lastErrorTs || null,
    consecutive_failures: failCount,
    source_mix_1h: getSourceMixLastHour(),
  });
});

module.exports = router;