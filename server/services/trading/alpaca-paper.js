const fetch = require('node-fetch');

class AlpacaPaperTrading {
  constructor() {
    this.baseURL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
    this.apiKey = process.env.APCA_API_KEY_ID;
    this.apiSecret = process.env.APCA_API_SECRET_KEY;
    
    this.headers = {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.apiSecret,
      'Content-Type': 'application/json'
    };
    
    console.log(`🏛️ AlpacaPaper: Initialized with ${this.baseURL.includes('paper') ? 'PAPER' : 'LIVE'} trading`);
  }

  async createOrder(ticker, side, qty, type = 'market', timeInForce = 'day') {
    try {
      if (!this.apiKey || !this.apiSecret) {
        throw new Error('Alpaca API credentials not configured');
      }

      console.log(`🎯 AlpacaPaper: Creating ${side.toUpperCase()} order for ${qty} shares of ${ticker}`);

      const order = {
        symbol: ticker.toUpperCase(),
        qty: Math.floor(qty), // Ensure integer
        side: side.toLowerCase(),
        type: type.toLowerCase(),
        time_in_force: timeInForce.toLowerCase()
      };

      const response = await fetch(`${this.baseURL}/v2/orders`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(order)
      });

      const result = await response.json();

      if (!response.ok) {
        console.error(`❌ AlpacaPaper: Order failed - ${result.message}`);
        return {
          success: false,
          error: result.message || 'Order execution failed'
        };
      }

      console.log(`✅ AlpacaPaper: Order placed successfully - ID: ${result.id}`);
      return {
        success: true,
        order: result,
        orderId: result.id,
        symbol: result.symbol,
        qty: result.qty,
        side: result.side,
        status: result.status
      };

    } catch (error) {
      console.error(`❌ AlpacaPaper: Order error - ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createBracketOrder(ticker, qty, currentPrice, tpPct = 0.15, slPct = 0.08) {
    try {
      console.log(`🎯 AlpacaPaper: Creating bracket order for ${ticker} - ${qty} shares`);

      const takeProfitPrice = (currentPrice * (1 + tpPct)).toFixed(2);
      const stopLossPrice = (currentPrice * (1 - slPct)).toFixed(2);

      const bracketOrder = {
        symbol: ticker.toUpperCase(),
        qty: Math.floor(qty),
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        take_profit: {
          limit_price: takeProfitPrice
        },
        stop_loss: {
          stop_price: stopLossPrice
        }
      };

      const response = await fetch(`${this.baseURL}/v2/orders`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(bracketOrder)
      });

      const result = await response.json();

      if (!response.ok) {
        console.error(`❌ AlpacaPaper: Bracket order failed - ${result.message}`);
        return {
          success: false,
          error: result.message || 'Bracket order failed'
        };
      }

      console.log(`✅ AlpacaPaper: Bracket order placed - ID: ${result.id}, TP: $${takeProfitPrice}, SL: $${stopLossPrice}`);
      return {
        success: true,
        order: result,
        targets: {
          takeProfit: takeProfitPrice,
          stopLoss: stopLossPrice
        }
      };

    } catch (error) {
      console.error(`❌ AlpacaPaper: Bracket order error - ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAccount() {
    try {
      const response = await fetch(`${this.baseURL}/v2/account`, { 
        headers: this.headers 
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const account = await response.json();
      return {
        success: true,
        account: {
          cash: parseFloat(account.cash),
          portfolio_value: parseFloat(account.portfolio_value),
          buying_power: parseFloat(account.buying_power),
          equity: parseFloat(account.equity),
          day_trade_count: account.day_trade_count,
          pattern_day_trader: account.pattern_day_trader
        }
      };
    } catch (error) {
      console.error(`❌ AlpacaPaper: Account fetch error - ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getPositions() {
    try {
      const response = await fetch(`${this.baseURL}/v2/positions`, { 
        headers: this.headers 
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const positions = await response.json();
      return {
        success: true,
        positions: positions.map(pos => ({
          symbol: pos.symbol,
          qty: parseFloat(pos.qty),
          side: pos.side,
          market_value: parseFloat(pos.market_value),
          cost_basis: parseFloat(pos.cost_basis),
          unrealized_pl: parseFloat(pos.unrealized_pl),
          unrealized_plpc: parseFloat(pos.unrealized_plpc) * 100,
          avg_entry_price: parseFloat(pos.avg_entry_price),
          current_price: parseFloat(pos.current_price)
        }))
      };
    } catch (error) {
      console.error(`❌ AlpacaPaper: Positions fetch error - ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getOrders(status = 'all', limit = 50) {
    try {
      const url = `${this.baseURL}/v2/orders?status=${status}&limit=${limit}&direction=desc`;
      const response = await fetch(url, { headers: this.headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const orders = await response.json();
      return {
        success: true,
        orders: orders.map(order => ({
          id: order.id,
          symbol: order.symbol,
          qty: parseFloat(order.qty),
          side: order.side,
          type: order.type,
          status: order.status,
          filled_qty: parseFloat(order.filled_qty || 0),
          filled_avg_price: parseFloat(order.filled_avg_price || 0),
          created_at: order.created_at,
          updated_at: order.updated_at
        }))
      };
    } catch (error) {
      console.error(`❌ AlpacaPaper: Orders fetch error - ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async cancelOrder(orderId) {
    try {
      const response = await fetch(`${this.baseURL}/v2/orders/${orderId}`, {
        method: 'DELETE',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`✅ AlpacaPaper: Order ${orderId} cancelled successfully`);
      return { success: true };
    } catch (error) {
      console.error(`❌ AlpacaPaper: Cancel order error - ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Risk management checks
  async validateTrade(ticker, qty, side, currentPrice) {
    try {
      const account = await this.getAccount();
      if (!account.success) {
        return { valid: false, reason: 'Could not fetch account info' };
      }

      const tradeValue = qty * currentPrice;
      const maxTradeSize = account.account.portfolio_value * 0.10; // 10% max position

      if (tradeValue > maxTradeSize) {
        return { 
          valid: false, 
          reason: `Trade size $${tradeValue.toFixed(2)} exceeds 10% limit ($${maxTradeSize.toFixed(2)})` 
        };
      }

      if (side === 'buy' && tradeValue > account.account.buying_power) {
        return { 
          valid: false, 
          reason: `Insufficient buying power: $${account.account.buying_power.toFixed(2)}` 
        };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }
}

module.exports = AlpacaPaperTrading;