const express = require('express');
const path = require('path');
const fs = require('fs');
const { runScreener } = require('../../../../lib/runScreener');
const { getProfile } = require('../../../../lib/screenerProfile');
const { noteSuccess, noteFailure, isTripped } = require('../../../services/circuitBreaker');
const { recordSourceUsage } = require('../../../services/sourceMix');

const router = express.Router();

// 🚫 Never allow mock in production
const allowMock = false;

// Remove old runner - using shared runScreener from lib/

function normalize(raw) {
  const results = [];
  
  // Handle direct array of items from screener
  if (Array.isArray(raw)) {
    return raw.filter(item => item && (item.ticker || item.symbol)).map(mapItem);
  }
  
  // Handle object with items property (AlphaStack format)
  if (raw && raw.items && Array.isArray(raw.items)) {
    return raw.items.filter(item => item && (item.ticker || item.symbol)).map(mapItem);
  }
  
  // Handle single item
  if (raw && (raw.ticker || raw.symbol)) {
    return [mapItem(raw)];
  }
  
  // Handle case where raw is an object but items might be nested
  if (raw && typeof raw === 'object') {
    // Look for any array property that contains ticker/symbol objects
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value) && value.length > 0 && value[0] && (value[0].ticker || value[0].symbol)) {
        return value.filter(item => item && (item.ticker || item.symbol)).map(mapItem);
      }
    }
  }
  
  return results;
}

function mapItem(item) {
  return {
    ticker: item.ticker || item.symbol,
    price: item.price || item.current_price || 0,
    score: item.score || item.vigl_score || 70,
    action: item.action || ((item.score || 70) >= 75 ? 'BUY' : (item.score || 70) >= 65 ? 'EARLY_READY' : 'PRE_BREAKOUT'),
    confidence: Math.min(95, Math.max(60, item.score || 70)),
    thesis: item.thesis || item.thesis_tldr || `Discovery score: ${item.score || 70}`,
    engine: item.engine || 'screener_live',
    run_id: item.run_id || `screener_${Date.now()}`,
    snapshot_ts: item.snapshot_ts || new Date().toISOString()
  };
}

async function loadSqliteScores(limit) {
  const dbPath = path.join(process.cwd(), 'trading_dashboard.db');
  if (!fs.existsSync(dbPath)) return [];
  
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT ticker, score, price, current_price, thesis, updated_at 
       FROM latest_scores 
       WHERE score >= 50 
       ORDER BY score DESC, updated_at DESC 
       LIMIT ?`,
      [limit],
      (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve((rows || []).map(row => ({
          ticker: row.ticker,
          price: row.price || row.current_price || 0,
          score: row.score || 70,
          action: (row.score || 70) >= 75 ? 'BUY' : (row.score || 70) >= 65 ? 'EARLY_READY' : 'PRE_BREAKOUT',
          confidence: Math.min(95, Math.max(60, row.score || 70)),
          thesis: row.thesis || `Cached score: ${row.score || 70}`,
          engine: 'sqlite_fallback',
          run_id: 'latest-scores',
          snapshot_ts: new Date().toISOString()
        })));
      }
    );
  });
}

router.get('/', async (req, res) => {
  const rawLimit = Number(req.query.limit ?? 6);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(12, rawLimit)) : 6;
  const t0 = Date.now();
  
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const breaker = isTripped() ? 'tripped' : 'ok';

  // 1) Screener (live) — only if breaker OK
  if (breaker === 'ok') {
    try {
      const { args } = getProfile();
      const raw = await runScreener(['--limit', String(limit), ...args], 15000);
      const items = normalize(raw).slice(0, limit);
      if (items.length) {
        noteSuccess();
        recordSourceUsage('screener');
        const duration_ms = Date.now() - t0;
        console.info(`[contenders] source=screener items=${items.length} duration_ms=${duration_ms} breaker=ok`);
        return res.status(200).json({ items, meta: { source: 'screener', duration_ms, breaker: 'ok' } });
      }
    } catch (e) {
      console.warn('contenders primary failed:', e?.message || e);
      noteFailure();
      // fallthrough to sqlite
    }
  }

  try {
    // 2) SQLite cache (last known real scores)
    const rows = await loadSqliteScores(limit);
    if (rows && rows.length) {
      recordSourceUsage('sqlite');
      const duration_ms = Date.now() - t0;
      console.info(`[contenders] source=sqlite items=${rows.length} duration_ms=${duration_ms} breaker=${breaker}`);
      return res.status(200).json({ items: rows, meta: { source: 'sqlite', duration_ms, breaker } });
    }
  } catch (e) {
    console.warn('sqlite fallback failed:', e?.message || e);
  }

  // 3) Empty — safest fail-closed behavior
  recordSourceUsage('empty');
  const duration_ms = Date.now() - t0;
  console.info(`[contenders] source=empty items=0 duration_ms=${duration_ms} breaker=${breaker}`);
  return res.status(200).json({ items: [], meta: { source: 'empty', duration_ms, breaker } });
});

module.exports = router;