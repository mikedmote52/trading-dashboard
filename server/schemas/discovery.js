/**
 * Canonical Discovery Schema V1
 * 
 * Single source of truth for discovery data ingestion
 * Both Python screener and AlphaStack paths must normalize to this contract
 */

// Manual validation (bypassing zod temporarily due to version compatibility issues)
function validateDiscovery(data) {
  // Basic required field validation
  if (!data || typeof data !== 'object') {
    throw new Error('Data must be an object');
  }
  if (!data.ticker || typeof data.ticker !== 'string') {
    throw new Error('ticker must be a non-empty string');
  }
  if (typeof data.score !== 'number' || data.score < 0 || data.score > 100) {
    throw new Error('score must be a number between 0 and 100');
  }
  
  // Apply defaults for missing fields
  const validated = {
    ticker: data.ticker,
    score: data.score,
    price: data.price || null,
    confidence: data.confidence || "low",
    relVol: data.relVol || null,
    atrPct: data.atrPct || null,
    rsi: data.rsi || null,
    vwapDistPct: data.vwapDistPct || null,
    shortInterestPct: data.shortInterestPct || null,
    borrowFeePct: data.borrowFeePct || null,
    utilizationPct: data.utilizationPct || null,
    ivPercentile: data.ivPercentile || null,
    callPutRatio: data.callPutRatio || null,
    catalyst: data.catalyst || null,
    sentimentScore: data.sentimentScore || null,
    reasons: data.reasons || [],
    meta: data.meta || {}
  };
  
  return validated;
}

function safeValidateDiscovery(data) {
  try {
    const validated = validateDiscovery(data);
    return { success: true, data: validated };
  } catch (error) {
    return { 
      success: false, 
      error: error.message || String(error)
    };
  }
}

module.exports = {
  validateDiscovery,
  safeValidateDiscovery
};