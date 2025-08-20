/**
 * Unified Advice Engine
 * Single brain helper that coordinates recommendations for all UIs
 */

const { decideAction } = require('../engine/reco/decideAction');

// Helper to map arrays by key
const mapBy = (arr, k='ticker') => Object.fromEntries(arr.map(x=>[x[k],x]));

/**
 * Generate unified advice for all tickers across scores, positions, and thesis
 */
async function advise({ scores=[], positions=[], thesisMap={} }) {
  // Ensure scores and positions are arrays
  const scoresArray = Array.isArray(scores) ? scores : [];
  const positionsArray = Array.isArray(positions) ? positions : [];
  
  console.log(`🧠 Advise: Processing ${scoresArray.length} scores, ${positionsArray.length} positions`);
  
  // Create lookup maps
  const S = mapBy(scoresArray);
  const P = mapBy(positionsArray);
  
  // Get all unique tickers from scores and positions
  const tickers = [...new Set([...Object.keys(S), ...Object.keys(P)])];
  
  console.log(`🎯 Advise: Analyzing ${tickers.length} tickers: ${tickers.join(', ')}`);
  
  // Generate decision for each ticker
  const decisions = tickers.map(ticker => {
    const scoreBundle = S[ticker];
    const position = P[ticker];
    const thesisTrend = thesisMap[ticker]?.trend;
    
    const decision = decideAction({
      scoreBundle,
      position, 
      thesisTrend
    });
    
    console.log(`📊 ${ticker}: ${decision.action} (${Math.round(decision.confidence*100)}% conf) - ${decision.reason_codes.join(', ')}`);
    
    return decision;
  });
  
  // Log summary
  const actionCounts = decisions.reduce((acc, d) => {
    acc[d.action] = (acc[d.action] || 0) + 1;
    return acc;
  }, {});
  
  console.log(`✅ Advise: Generated ${decisions.length} decisions:`, actionCounts);
  
  return decisions;
}

module.exports = { advise };