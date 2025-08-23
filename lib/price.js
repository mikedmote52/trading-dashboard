/**
 * Price Normalization Utilities
 * Ensures consistent price extraction from various provider formats
 */

/**
 * Coerce a value to a number, handling strings with currency symbols
 * @param {any} x - Value to coerce
 * @returns {number|null} - Normalized number or null
 */
function coerceNumber(x) {
  if (x == null) return null;
  const n = typeof x === 'string' ? Number(x.replace(/[$,]/g, '')) : Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract and normalize price from various provider response formats
 * @param {any} obj - Object potentially containing price data
 * @returns {number|null} - Normalized price > 0 or null
 */
function normalizePrice(obj) {
  if (!obj) return null;
  
  // Known provider field names, ordered by preference
  const candidates = [
    obj.price,
    obj.current_price,                 // Features service format
    obj.last,
    obj.lastPrice,
    obj.close,
    obj.currentPrice,
    obj.marketPrice,
    obj.ap?.c,                        // Alpaca aggregate close
    obj.alpaca?.last?.trade?.p,       // Alpaca last trade price
    obj.polygon?.last?.trade?.p,      // Polygon last trade price
    obj.quote?.price,                  // Quote service price
    obj.latestPrice,                   // IEX-style
    obj.regularMarketPrice,            // Yahoo-style
    obj.data?.price,                   // Nested data structure
  ];
  
  for (const c of candidates) {
    const n = coerceNumber(c);
    if (n != null && n > 0) return n;
  }
  
  return null;
}

/**
 * Choose the best price from multiple provider responses
 * @param {Array<any>} parts - Array of provider responses
 * @returns {number|null} - Best available price or null
 */
function chooseFinalPrice(parts) {
  if (!Array.isArray(parts)) return null;
  
  // Highest quality first: real-time last trade, then aggregate close, then quote
  for (const p of parts) {
    const n = normalizePrice(p);
    if (n != null && n > 0) return n;
  }
  
  return null;
}

/**
 * Ensure a valid price exists, with fallback and validation
 * @param {any} data - Data object to check/update
 * @param {string} ticker - Ticker symbol for logging
 * @returns {number|null} - Valid price or null
 */
function ensureValidPrice(data, ticker) {
  const price = normalizePrice(data);
  
  if (!price || price <= 0) {
    console.warn(`⚠️ [price_missing] ${ticker}: no valid price found in data`);
    return null;
  }
  
  // Sanity check for unrealistic prices
  if (price > 1000000) {
    console.warn(`⚠️ [price_suspicious] ${ticker}: price=${price} seems unrealistic`);
    return null;
  }
  
  return price;
}

module.exports = {
  coerceNumber,
  normalizePrice,
  chooseFinalPrice,
  ensureValidPrice
};