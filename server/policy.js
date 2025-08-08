/**
 * Trading Policy Module
 * Enforces risk limits and paper trading mode
 */

// Policy constants with defaults
const MAX_SINGLE_ORDER_DOLLARS = parseFloat(process.env.MAX_SINGLE_ORDER_DOLLARS || '5000');
const MAX_PER_SYMBOL_EXPOSURE = parseFloat(process.env.MAX_PER_SYMBOL_EXPOSURE || '0.15');
const MAX_DAY_DRAWDOWN = parseFloat(process.env.MAX_DAY_DRAWDOWN || '0.05');

/**
 * Assert paper trading mode is enabled
 * @throws {Error} if not in paper mode and live trading not explicitly allowed
 */
function assertPaperMode() {
  const isPaper = process.env.ALPACA_PAPER === '1';
  const allowLive = process.env.ALLOW_LIVE === '1';
  
  if (!isPaper && !allowLive) {
    throw new Error('Trading requires ALPACA_PAPER=1 or explicit ALLOW_LIVE=1');
  }
}

/**
 * Check if a buy order can be placed based on risk policy
 * @param {Object} params
 * @param {number} params.portfolioValue - Total portfolio value
 * @param {number} params.symbolExposure - Current exposure to this symbol
 * @param {number} params.intendedCost - Cost of intended order
 * @param {number} params.todaysDrawdown - Today's drawdown percentage
 * @returns {Object} { ok: boolean, reason: string }
 */
function canPlaceBuy({ portfolioValue, symbolExposure, intendedCost, todaysDrawdown }) {
  // Check single order limit
  if (intendedCost > MAX_SINGLE_ORDER_DOLLARS) {
    return {
      ok: false,
      reason: `Order exceeds max single order limit of $${MAX_SINGLE_ORDER_DOLLARS}`
    };
  }
  
  // Check per-symbol exposure limit
  const newExposure = (symbolExposure + intendedCost) / portfolioValue;
  if (newExposure > MAX_PER_SYMBOL_EXPOSURE) {
    return {
      ok: false,
      reason: `Would exceed max ${(MAX_PER_SYMBOL_EXPOSURE * 100).toFixed(0)}% exposure per symbol`
    };
  }
  
  // Check daily drawdown limit
  if (todaysDrawdown > MAX_DAY_DRAWDOWN) {
    return {
      ok: false,
      reason: `Today's drawdown (${(todaysDrawdown * 100).toFixed(1)}%) exceeds max ${(MAX_DAY_DRAWDOWN * 100).toFixed(0)}%`
    };
  }
  
  return { ok: true, reason: 'Policy checks passed' };
}

module.exports = {
  assertPaperMode,
  canPlaceBuy,
  MAX_SINGLE_ORDER_DOLLARS,
  MAX_PER_SYMBOL_EXPOSURE,
  MAX_DAY_DRAWDOWN
};