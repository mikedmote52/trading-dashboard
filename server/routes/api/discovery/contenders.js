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
  
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  
  try {
    // Try enriched discoveries first (with composite scores and reasons)
    const enrichedRows = db.prepare(`
      SELECT symbol as ticker, score_composite as score, price, reasons_json, 
             score_momentum, score_squeeze, score_sentiment, score_options, score_technical,
             updated_at, thesis
      FROM discoveries
      WHERE score_composite IS NOT NULL 
        AND score_composite >= 75
        AND json_array_length(COALESCE(reasons_json,'[]')) >= 2
      ORDER BY score_composite DESC, id DESC
      LIMIT ?
    `).all(limit);

    if (enrichedRows.length > 0) {
      console.log(`[contenders] Using enriched discoveries: ${enrichedRows.length} items`);
      return enrichedRows.map(row => ({
        ticker: row.ticker,
        price: row.price || 0,
        score: row.score || 70,
        action: (row.score || 70) >= 85 ? 'BUY' : (row.score || 70) >= 75 ? 'EARLY_READY' : 'PRE_BREAKOUT',
        confidence: Math.min(95, Math.max(60, row.score || 70)),
        thesis: buildEnrichedThesis(row),
        engine: 'enriched_composite',
        run_id: 'composite-scores',
        snapshot_ts: new Date().toISOString(),
        subscores: {
          momentum: row.score_momentum,
          squeeze: row.score_squeeze, 
          sentiment: row.score_sentiment,
          options: row.score_options,
          technical: row.score_technical
        },
        reasons: JSON.parse(row.reasons_json || '[]')
      }));
    }

    // Fallback to legacy latest_scores table
    const legacyRows = db.prepare(`
      SELECT ticker, score, price, current_price, thesis, updated_at 
      FROM latest_scores 
      WHERE score >= 50 
      ORDER BY score DESC, updated_at DESC 
      LIMIT ?
    `).all(limit);

    return legacyRows.map(row => ({
      ticker: row.ticker,
      price: row.price || row.current_price || 0,
      score: row.score || 70,
      action: (row.score || 70) >= 75 ? 'BUY' : (row.score || 70) >= 65 ? 'EARLY_READY' : 'PRE_BREAKOUT',
      confidence: Math.min(95, Math.max(60, row.score || 70)),
      thesis: row.thesis || `Cached score: ${row.score || 70}`,
      engine: 'sqlite_fallback',
      run_id: 'latest-scores',
      snapshot_ts: new Date().toISOString()
    }));

  } finally {
    db.close();
  }
}

function buildEnrichedThesis(row) {
  const reasons = JSON.parse(row.reasons_json || '[]');
  const price = row.price || 0;
  const priceCat = price < 2 ? 'Ultra micro-cap' : price < 10 ? 'Micro-cap' : price < 50 ? 'Small-cap' : 'Mid-cap';
  
  let thesis = `${priceCat} $${price}. `;
  if (reasons.length > 0) {
    thesis += `Key signals: ${reasons.join(', ')}. `;
  }
  thesis += `Composite score: ${row.score}`;
  
  return thesis;
}

router.get('/', async (req, res) => {
  const rawLimit = Number(req.query.limit ?? 6);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(12, rawLimit)) : 6;
  const t0 = Date.now();
  
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const breaker = isTripped() ? 'tripped' : 'ok';
  let responseSent = false;

  // 1) Screener (live) — only if breaker OK
  if (breaker === 'ok' && !responseSent) {
    try {
      const { args } = getProfile();
      const raw = await runScreener(['--limit', String(limit), ...args], 15000);
      const items = normalize(raw).slice(0, limit);
      if (items.length && !responseSent) {
        responseSent = true;
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

  if (!responseSent) {
    try {
      // 2) SQLite cache (last known real scores)
      const rows = await loadSqliteScores(limit);
      if (rows && rows.length && !responseSent) {
        responseSent = true;
        recordSourceUsage('sqlite');
        const duration_ms = Date.now() - t0;
        console.info(`[contenders] source=sqlite items=${rows.length} duration_ms=${duration_ms} breaker=${breaker}`);
        return res.status(200).json({ items: rows, meta: { source: 'sqlite', duration_ms, breaker } });
      }
    } catch (e) {
      console.warn('sqlite fallback failed:', e?.message || e);
    }
  }

  // 3) Empty — safest fail-closed behavior
  if (!responseSent) {
    recordSourceUsage('empty');
    const duration_ms = Date.now() - t0;
    console.info(`[contenders] source=empty items=0 duration_ms=${duration_ms} breaker=${breaker}`);
    return res.status(200).json({ items: [], meta: { source: 'empty', duration_ms, breaker } });
  }
});

module.exports = router;