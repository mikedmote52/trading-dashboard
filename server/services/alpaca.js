const Alpaca = require('@alpacahq/alpaca-trade-api');

// Initialize Alpaca client
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_KEY || process.env.APCA_API_KEY_ID || '',
  secretKey: process.env.ALPACA_SECRET || process.env.APCA_API_SECRET_KEY || '',
  paper: process.env.ALPACA_PAPER === '1',
  baseUrl: process.env.ALPACA_PAPER === '1' 
    ? 'https://paper-api.alpaca.markets' 
    : 'https://api.alpaca.markets'
});

/**
 * Get account information
 * @returns {Promise<Object>} Account data
 */
async function getAccount() {
  try {
    const account = await alpaca.getAccount();
    return {
      cash: parseFloat(account.cash),
      portfolio_value: parseFloat(account.portfolio_value),
      buying_power: parseFloat(account.buying_power),
      equity: parseFloat(account.equity),
      day_trade_count: account.daytrade_count,
      pattern_day_trader: account.pattern_day_trader
    };
  } catch (error) {
    console.error('Error fetching account:', error);
    throw new Error(`Failed to fetch account: ${error.message}`);
  }
}

/**
 * Get all positions
 * @returns {Promise<Array>} Array of positions
 */
async function getPositions() {
  try {
    const positions = await alpaca.getPositions();
    return positions.map(p => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avg_entry_price: parseFloat(p.avg_entry_price),
      current_price: parseFloat(p.current_price || 0),
      market_value: parseFloat(p.market_value),
      cost_basis: parseFloat(p.cost_basis),
      unrealized_pl: parseFloat(p.unrealized_pl),
      unrealized_plpc: parseFloat(p.unrealized_plpc),
      asset_id: p.asset_id,
      exchange: p.exchange
    }));
  } catch (error) {
    console.error('Error fetching positions:', error);
    throw new Error(`Failed to fetch positions: ${error.message}`);
  }
}

/**
 * Place an order
 * @param {Object} params Order parameters
 * @returns {Promise<Object>} Order response
 */
async function placeOrder({ symbol, qty, side, type = 'market', time_in_force = 'day' }) {
  try {
    const order = await alpaca.createOrder({
      symbol,
      qty: Math.floor(qty), // Ensure whole shares
      side,
      type,
      time_in_force
    });
    
    return {
      id: order.id,
      client_order_id: order.client_order_id,
      symbol: order.symbol,
      qty: order.qty,
      side: order.side,
      type: order.type,
      status: order.status,
      filled_qty: order.filled_qty,
      filled_avg_price: order.filled_avg_price,
      created_at: order.created_at,
      raw: order
    };
  } catch (error) {
    console.error('Error placing order:', error);
    throw new Error(`Failed to place order: ${error.message}`);
  }
}

/**
 * Get recent orders
 * @param {Object} params Query parameters
 * @returns {Promise<Array>} Array of orders
 */
async function getOrders({ status = 'all', limit = 100, symbols = null }) {
  try {
    const params = { status, limit };
    if (symbols) params.symbols = symbols;
    
    const orders = await alpaca.getOrders(params);
    return orders.map(o => ({
      id: o.id,
      symbol: o.symbol,
      qty: parseFloat(o.qty),
      filled_qty: parseFloat(o.filled_qty || 0),
      side: o.side,
      type: o.type,
      status: o.status,
      filled_avg_price: parseFloat(o.filled_avg_price || 0),
      created_at: o.created_at,
      filled_at: o.filled_at
    }));
  } catch (error) {
    console.error('Error fetching orders:', error);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
}

/**
 * Get current quote for a symbol
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Quote data
 */
async function getQuote(symbol) {
  try {
    const quote = await alpaca.getLatestQuote(symbol);
    return {
      symbol,
      bid: parseFloat(quote.BidPrice || 0),
      ask: parseFloat(quote.AskPrice || 0),
      bid_size: quote.BidSize || 0,
      ask_size: quote.AskSize || 0,
      timestamp: quote.Timestamp
    };
  } catch (error) {
    console.error('Error fetching quote:', error);
    throw new Error(`Failed to fetch quote: ${error.message}`);
  }
}

module.exports = {
  getAccount,
  getPositions,
  placeOrder,
  getOrders,
  getQuote
};