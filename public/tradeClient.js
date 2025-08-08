/**
 * Trading Client Library
 * Provides functions to interact with the trading API
 */

const API_BASE = window.location.origin;

/**
 * Place a buy order
 * @param {string} symbol Stock symbol
 * @param {number} dollars Dollar amount to buy
 * @param {Object} options Additional options (features, confidence, notes)
 * @returns {Promise<Object>} Order response
 */
async function tradeBuy(symbol, dollars, options = {}) {
  try {
    const response = await fetch(`${API_BASE}/api/trade/buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symbol,
        dollars,
        features: options.features,
        confidence: options.confidence,
        notes: options.notes
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.reason || 'Trade failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Buy trade error:', error);
    throw error;
  }
}

/**
 * Place a sell order
 * @param {string} symbol Stock symbol
 * @param {number} qty Number of shares to sell
 * @param {string} notes Optional notes
 * @returns {Promise<Object>} Order response
 */
async function tradeSell(symbol, qty, notes = '') {
  try {
    const response = await fetch(`${API_BASE}/api/trade/sell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symbol,
        qty,
        notes
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Trade failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Sell trade error:', error);
    throw error;
  }
}

/**
 * Adjust a position
 * @param {string} symbol Stock symbol
 * @param {number} deltaQty Change in quantity (positive to buy, negative to sell)
 * @param {string} notes Optional notes
 * @returns {Promise<Object>} Order response
 */
async function tradeAdjust(symbol, deltaQty, notes = '') {
  try {
    const response = await fetch(`${API_BASE}/api/trade/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symbol,
        deltaQty,
        notes
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.reason || 'Trade failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Adjust trade error:', error);
    throw error;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tradeBuy,
    tradeSell,
    tradeAdjust
  };
}

// Also make available globally for browser
if (typeof window !== 'undefined') {
  window.tradeClient = {
    tradeBuy,
    tradeSell,
    tradeAdjust
  };
}