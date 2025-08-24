/**
 * Enrichment job for composite component scoring
 * Reads latest discoveries, enriches with provider data, computes sub-scores and composite scores
 */

const Database = require('better-sqlite3');
const path = require('path');
const { 
  momentumProvider, 
  squeezeProvider, 
  optionsProvider, 
  sentimentProvider, 
  technicalProvider 
} = require('../enrich/providers');
const { subScores, composite } = require('../enrich/score');

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', '..', 'trading_dashboard.db');

/**
 * Enrich latest discoveries with component scores
 * @param {number} limit - Number of recent discoveries to enrich
 */
async function enrichLatest(limit = 50) {
  const db = new Database(DB_PATH);
  
  try {
    // Get latest discoveries that need enrichment
    const rows = db.prepare(`
      SELECT id, symbol, score as baseScore, price, created_at
      FROM discoveries 
      WHERE score_composite IS NULL OR score_composite = 0
      ORDER BY id DESC 
      LIMIT ?
    `).all(limit);

    console.log(`[enrich] Processing ${rows.length} discoveries for enrichment`);

    for (const row of rows) {
      try {
        const ctx = { symbol: row.symbol, now: new Date() };

        // Fetch enrichment data from all providers
        const [momentum, squeeze, options, sentiment, technical] = await Promise.all([
          momentumProvider(ctx),
          squeezeProvider(ctx),
          optionsProvider(ctx), 
          sentimentProvider(ctx),
          technicalProvider(ctx)
        ]);

        // Build combined enrichment object
        const comps = { momentum, squeeze, options, sentiment, technical };
        
        // Calculate sub-scores
        const subs = subScores(comps);
        
        // Generate reasons based on enrichment data
        const reasons = [];
        if (momentum.relVol >= 3) reasons.push("relVol≥3×");
        if (technical.holdingVWAP) reasons.push("VWAP reclaim/hold");
        if (squeeze.shortPct && squeeze.shortPct >= 20) reasons.push("Short%≥20");
        if (options.ivPctile && options.ivPctile >= 80) reasons.push("IV%ile≥80");
        if (momentum.rsi >= 60 && momentum.rsi <= 70) reasons.push("RSI sweet spot");
        if (technical.ema9_gt_ema20) reasons.push("EMA bullish cross");
        if (momentum.atrPct >= 0.05) reasons.push("High volatility");

        // Calculate composite score
        const scoreComposite = composite(row.baseScore || 50, subs);

        // Update discovery with enrichment data
        const updateStmt = db.prepare(`
          UPDATE discoveries SET
            components_json = ?,
            reasons_json = ?,
            score_momentum = ?,
            score_squeeze = ?,
            score_sentiment = ?,
            score_options = ?,
            score_technical = ?,
            score_composite = ?
          WHERE id = ?
        `);

        updateStmt.run(
          JSON.stringify(comps),
          JSON.stringify(reasons),
          Math.round(subs.momentum * 100),
          Math.round(subs.squeeze * 100),
          Math.round(subs.sentiment * 100), 
          Math.round(subs.options * 100),
          Math.round(subs.technical * 100),
          scoreComposite,
          row.id
        );

        // Log high-scoring discoveries
        if (scoreComposite >= 75) {
          console.log(`🚀 High-score discovery: ${row.symbol} (${scoreComposite}) - ${reasons.join(', ')}`);
        }

      } catch (error) {
        console.warn(`[enrich] Failed to enrich ${row.symbol}:`, error.message);
      }
    }

    console.log(`[enrich] Updated ${rows.length} discoveries with composite scores`);

  } catch (error) {
    console.error('[enrich] Enrichment job failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run enrichment if called directly
if (require.main === module) {
  const limit = parseInt(process.argv[2]) || 50;
  enrichLatest(limit)
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = enrichLatest;