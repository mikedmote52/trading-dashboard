/**
 * Unified Discovery Ingestion Service
 * 
 * Single point of truth for discovery data ingestion
 * Handles both Python screener and AlphaStack paths through canonical DiscoveryV1 schema
 */

import { DiscoveryV1, validateDiscovery } from "../schemas/discovery";
import { adaptPyScreenerOutput, PyScreenerItem } from "../adapters/py_v2";
import { adaptAlphaStackBatch, AlphaStackItem } from "../adapters/alphastack";

const { db } = require('../db/sqlite');

export interface IngestionResult {
  success: boolean;
  total: number;
  inserted: number;
  invalid: number;
  sample: Array<{ ticker: string; score: number; source: string }>;
  errors: string[];
}

/**
 * Insert validated discoveries into database
 */
function insertDiscoveries(discoveries: DiscoveryV1[], source: string): IngestionResult {
  const inserted: string[] = [];
  const errors: string[] = [];
  
  // Prepare insert statement for main discoveries table
  const stmt = db.prepare(`
    INSERT INTO discoveries (id, symbol, score, price, preset, action, features_json, audit_json, created_at)
    VALUES (@id, @symbol, @score, @price, @preset, @action, @features_json, @audit_json, CURRENT_TIMESTAMP)
  `);
  
  // Prepare VIGL compatibility insert
  const viglStmt = db.prepare(`
    INSERT INTO discoveries_vigl (symbol, asof, price, score, rvol, action, components)
    VALUES (@symbol, @asof, @price, @score, @rvol, @action, @components)
    ON CONFLICT(symbol, asof) DO UPDATE SET
      price = excluded.price,
      score = excluded.score,
      rvol = excluded.rvol,
      action = excluded.action,
      components = excluded.components,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const asof = new Date().toISOString();
  
  for (const discovery of discoveries) {
    try {
      const uuid = require('crypto').randomUUID();
      
      // Determine action from score
      const action = discovery.score >= 90 ? 'BUY' : 
                   discovery.score >= 75 ? 'WATCHLIST' : 'MONITOR';
      
      // Build features JSON
      const features = {
        indicators: {
          relVol: discovery.relVol,
          atrPct: discovery.atrPct,
          rsi: discovery.rsi,
          vwapDistPct: discovery.vwapDistPct,
          shortInterestPct: discovery.shortInterestPct,
          borrowFeePct: discovery.borrowFeePct,
          utilizationPct: discovery.utilizationPct,
          ivPercentile: discovery.ivPercentile,
          callPutRatio: discovery.callPutRatio,
          sentimentScore: discovery.sentimentScore
        },
        catalyst: discovery.catalyst,
        reasons: discovery.reasons,
        confidence: discovery.confidence,
        timestamp: Date.now()
      };
      
      // Build audit JSON
      const audit = {
        source: source,
        schema_version: "v1",
        adapted_at: discovery.meta.adapted_at,
        run_id: `${source}_${Date.now()}`,
        created_at: new Date().toISOString()
      };
      
      // Insert into main discoveries table
      const mainInsert = stmt.run({
        id: uuid,
        symbol: discovery.ticker,
        score: discovery.score,
        price: discovery.price || 0,
        preset: `${source}_v1`,
        action: action,
        features_json: JSON.stringify(features),
        audit_json: JSON.stringify(audit)
      });
      
      if (mainInsert.changes > 0) {
        // Insert into VIGL compatibility table
        viglStmt.run({
          symbol: discovery.ticker,
          asof: asof,
          price: discovery.price || 0,
          score: discovery.score,
          rvol: discovery.relVol || 1.0,
          action: action,
          components: JSON.stringify({
            indicators: features.indicators,
            catalyst: discovery.catalyst,
            confidence: discovery.confidence,
            meta: discovery.meta
          })
        });
        
        inserted.push(discovery.ticker);
        console.log(`💾 Unified: ${discovery.ticker} (score: ${discovery.score}, confidence: ${discovery.confidence})`);
      }
      
    } catch (error) {
      const errorMsg = `Failed to insert ${discovery.ticker}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(`⚠️ ${errorMsg}`);
    }
  }
  
  const sample = inserted.slice(0, 3).map((ticker, i) => ({
    ticker,
    score: discoveries.find(d => d.ticker === ticker)?.score || 0,
    source
  }));
  
  return {
    success: errors.length < discoveries.length / 2, // Success if less than 50% failed
    total: discoveries.length,
    inserted: inserted.length,
    invalid: 0, // Already filtered out in adaptation
    sample,
    errors
  };
}

/**
 * Ingest Python screener output
 */
export function ingestPyScreener(items: PyScreenerItem[]): IngestionResult {
  console.log(`🐍 Ingesting ${items.length} Python screener items via unified schema`);
  
  const adapted = adaptPyScreenerOutput(items);
  
  if (adapted.invalid.length > 0) {
    console.warn(`⚠️ ${adapted.invalid.length} invalid Python items:`, adapted.invalid.slice(0, 3));
  }
  
  const result = insertDiscoveries(adapted.valid, "python_screener_v2");
  result.invalid = adapted.invalid.length;
  
  return result;
}

/**
 * Ingest AlphaStack enriched output  
 */
export function ingestAlphaStack(items: AlphaStackItem[]): IngestionResult {
  console.log(`📈 Ingesting ${items.length} AlphaStack items via unified schema`);
  
  const adapted = adaptAlphaStackBatch(items);
  
  if (adapted.invalid.length > 0) {
    console.warn(`⚠️ ${adapted.invalid.length} invalid AlphaStack items:`, adapted.invalid.slice(0, 3));
  }
  
  const result = insertDiscoveries(adapted.valid, "alphastack");
  result.invalid = adapted.invalid.length;
  
  return result;
}

/**
 * Ingest generic discovery items (auto-detect source)
 */
export function ingestDiscoveries(items: unknown[], sourceHint?: string): IngestionResult {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      total: 0,
      inserted: 0,
      invalid: 0,
      sample: [],
      errors: ["No items provided"]
    };
  }
  
  // Auto-detect source based on item structure
  const firstItem = items[0] as any;
  const isPyScreener = firstItem.ticker && firstItem.indicators && firstItem.thesis;
  const isAlphaStack = firstItem.enrichErrors !== undefined || firstItem.prefiltered !== undefined;
  
  if (isPyScreener || sourceHint === "python") {
    return ingestPyScreener(items as PyScreenerItem[]);
  } else if (isAlphaStack || sourceHint === "alphastack") {
    return ingestAlphaStack(items as AlphaStackItem[]);
  } else {
    // Try to validate as canonical DiscoveryV1
    const valid: DiscoveryV1[] = [];
    const errors: string[] = [];
    
    for (const item of items) {
      try {
        const discovery = validateDiscovery(item);
        valid.push(discovery);
      } catch (error) {
        errors.push(`Invalid discovery: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    if (valid.length > 0) {
      const result = insertDiscoveries(valid, sourceHint || "unknown");
      result.errors = [...result.errors, ...errors];
      return result;
    } else {
      return {
        success: false,
        total: items.length,
        inserted: 0,
        invalid: items.length,
        sample: [],
        errors: [`Could not auto-detect source format. Errors: ${errors.slice(0, 3).join(', ')}`]
      };
    }
  }
}