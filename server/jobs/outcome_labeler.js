/**
 * Outcome Labeler Job - Daily tracking of discovery performance
 * 
 * Fetches matured discoveries and labels them as win/loss/open
 * based on realized returns vs entry price after horizon period
 */

const { db } = require('../db/sqlite');

// Alpaca client for price data
let alpacaClient = null;
try {
  const Alpaca = require('@alpacahq/alpaca-trade-api');
  alpacaClient = new Alpaca({
    keyId: process.env.APCA_API_KEY_ID,
    secretKey: process.env.APCA_API_SECRET_KEY,
    baseUrl: process.env.ALPACA_TRADING_BASE || 'https://paper-api.alpaca.markets',
    dataBaseUrl: process.env.ALPACA_DATA_BASE || 'https://data.alpaca.markets'
  });
} catch (e) {
  console.warn('[outcome_labeler] Alpaca not available:', e.message);
}

/**
 * Find discoveries ready for outcome labeling
 */
function getMaturingDiscoveries() {
  const stmt = db.prepare(`
    SELECT id, symbol, price as entry_price, entry_at, horizon_days
    FROM discoveries 
    WHERE entry_at IS NOT NULL 
      AND horizon_days IS NOT NULL
      AND outcome IS NULL
      AND datetime(entry_at, '+' || horizon_days || ' days') <= datetime('now')
    ORDER BY entry_at ASC
    LIMIT 50
  `);
  
  return stmt.all();
}

/**
 * Update discovery outcome
 */
function updateOutcome(discoveryId, realizedReturn, outcome) {
  const stmt = db.prepare(`
    UPDATE discoveries 
    SET realized_return = ?, outcome = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  
  return stmt.run(realizedReturn, outcome, discoveryId);
}

/**
 * Fetch current price from Alpaca
 */
async function getCurrentPrice(symbol) {
  if (!alpacaClient) {
    throw new Error('Alpaca client not available');
  }
  
  try {
    // Get latest trade data
    const trades = await alpacaClient.getLatestTrade({
      symbol: symbol,
      asof: new Date().toISOString()
    });
    
    if (trades && trades.trade && trades.trade.price) {
      return parseFloat(trades.trade.price);
    }
    
    // Fallback to bars if trades not available
    const bars = await alpacaClient.getBarsV2(symbol, {
      timeframe: '1Day',
      limit: 1,
      end: new Date().toISOString()
    });
    
    if (bars && bars.bars && bars.bars.length > 0) {
      return parseFloat(bars.bars[0].c); // close price
    }
    
    throw new Error(`No price data available for ${symbol}`);
  } catch (error) {
    throw new Error(`Alpaca API error for ${symbol}: ${error.message}`);
  }
}

/**
 * Classify outcome based on realized return
 */
function classifyOutcome(realizedReturn) {
  if (realizedReturn >= 0.10) return 'win';   // >= +10%
  if (realizedReturn <= -0.10) return 'loss'; // <= -10%
  return 'open'; // Still within range
}

/**
 * Process a single discovery for outcome labeling
 */
async function processDiscovery(discovery) {
  const { id, symbol, entry_price, entry_at, horizon_days } = discovery;
  
  try {
    console.log(`[outcome_labeler] Processing ${symbol} (entry: $${entry_price}, ${horizon_days}d ago)`);
    
    const currentPrice = await getCurrentPrice(symbol);
    const realizedReturn = (currentPrice - entry_price) / entry_price;
    const outcome = classifyOutcome(realizedReturn);
    
    // Update database
    const result = updateOutcome(id, realizedReturn, outcome);
    
    console.log(`[outcome_labeler] ✅ ${symbol}: ${(realizedReturn * 100).toFixed(2)}% → ${outcome} (${result.changes} updated)`);
    
    return { symbol, realizedReturn, outcome, success: true };
    
  } catch (error) {
    console.error(`[outcome_labeler] ❌ ${symbol}: ${error.message}`);
    return { symbol, error: error.message, success: false };
  }
}

/**
 * Main outcome labeling job
 */
async function runOutcomeLabeler() {
  const startTime = Date.now();
  console.log('[outcome_labeler] 🚀 Starting daily outcome labeling...');
  
  try {
    const discoveries = getMaturingDiscoveries();
    console.log(`[outcome_labeler] Found ${discoveries.length} discoveries ready for labeling`);
    
    if (discoveries.length === 0) {
      console.log('[outcome_labeler] ✅ No discoveries to process');
      return { processed: 0, successes: 0, errors: 0 };
    }
    
    const results = [];
    
    // Process discoveries sequentially to avoid rate limits
    for (const discovery of discoveries) {
      const result = await processDiscovery(discovery);
      results.push(result);
      
      // Small delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const successes = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success).length;
    const duration = Date.now() - startTime;
    
    console.log(`[outcome_labeler] ✅ Complete: ${successes}/${discoveries.length} labeled (${errors} errors) in ${duration}ms`);
    
    // Report summary by outcome
    const outcomes = results.filter(r => r.success).reduce((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`[outcome_labeler] Outcome summary:`, outcomes);
    
    return { 
      processed: discoveries.length, 
      successes, 
      errors,
      outcomes 
    };
    
  } catch (error) {
    console.error('[outcome_labeler] ❌ Job failed:', error);
    throw error;
  }
}

/**
 * Get outcome statistics for telemetry
 */
function getOutcomeStats() {
  const stmt = db.prepare(`
    SELECT 
      outcome,
      COUNT(*) as count,
      AVG(realized_return) as avg_return,
      MIN(realized_return) as min_return,
      MAX(realized_return) as max_return
    FROM discoveries 
    WHERE outcome IS NOT NULL
    GROUP BY outcome
    ORDER BY 
      CASE outcome 
        WHEN 'win' THEN 1
        WHEN 'loss' THEN 2  
        WHEN 'open' THEN 3
        ELSE 4
      END
  `);
  
  return stmt.all();
}

module.exports = {
  runOutcomeLabeler,
  getMaturingDiscoveries,
  getOutcomeStats,
  processDiscovery
};