const express = require('express');
const { getRefresherState } = require('../../worker/discoveryRefresher');
const { getState: getBreakerState } = require('../../services/circuitBreaker');
const { getSourceMixLastHour } = require('../../services/sourceMix');
const { currentSession } = require('../../../lib/marketHours');
const { lastSnapshotAgeMs } = require('../../worker/watchdog');

const router = express.Router();

router.get('/discovery', async (_req, res) => {
  const { lastSuccessTs, lastErrorTs, failCount, lastRunDuration, universeTarget } = getRefresherState();
  const { session } = currentSession();
  const now = Date.now();
  const age = lastSuccessTs ? now - lastSuccessTs : Infinity;
  
  let status = 'down';
  if (age <= 90_000) status = 'ok';
  else if (age <= 300_000) status = 'degraded';

  let snapshotAgeMs = 0;
  try {
    snapshotAgeMs = await lastSnapshotAgeMs();
  } catch (e) {
    console.warn('[health] failed to get snapshot age:', e.message);
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status,
    session,
    universe_target_current: universeTarget,
    last_snapshot_age_ms: snapshotAgeMs,
    last_run_duration_ms: lastRunDuration,
    breaker: getBreakerState(),
    last_success_ts: lastSuccessTs || null,
    last_error_ts: lastErrorTs || null,
    consecutive_failures: failCount,
    source_mix_1h: getSourceMixLastHour(),
  });
});

module.exports = router;