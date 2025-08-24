/**
 * Polygon service - Simple interface to Polygon.io API
 */

const { PolygonProvider } = require('./providers/polygon');

// Create singleton instance
const polygon = new PolygonProvider();

/**
 * Get historical daily bars for a symbol between dates
 * @param {string} symbol - Stock symbol 
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Array} Array of OHLCV bars
 */
async function getHistoricalBars(symbol, fromDate, toDate) {
  return polygon.getHistoricalBars(symbol, fromDate, toDate);
}

/**
 * Get current market snapshot for a symbol
 */
async function getMarketSnapshot(symbol) {
  return polygon.getMarketSnapshot(symbol);
}

/**
 * Get current price for a symbol
 */
async function getCurrentPrice(symbol) {
  return polygon.getCurrentPrice(symbol);
}

/**
 * Get 30-day average daily volume
 */
async function getADV30(symbol) {
  return polygon.adv30(symbol);
}

module.exports = {
  getHistoricalBars,
  getMarketSnapshot, 
  getCurrentPrice,
  getADV30
};