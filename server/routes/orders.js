const express = require('express');
const https = require('https');
const router = express.Router();
const AlpacaPaperTrading = require('../services/trading/alpaca-paper');

const ORDERS_ENABLED = (process.env.ORDERS_ENABLED || '0') === '1';
const ALPACA_KEY = process.env.APCA_API_KEY_ID;
const ALPACA_SECRET = process.env.APCA_API_SECRET_KEY;
const ALPACA_BASE = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
const ACCOUNT_SUPPORTS_FRACTIONAL = false; // fractional orders don't support bracket orders

// Guardrails configuration
const MAX_DAILY_NOTIONAL = parseFloat(process.env.MAX_DAILY_NOTIONAL || '2000');
const MAX_TICKER_EXPOSURE = parseFloat(process.env.MAX_TICKER_EXPOSURE || '500');
const TRADE_START_ET = process.env.TRADE_START_ET || '09:35';
const TRADE_END_ET = process.env.TRADE_END_ET || '15:50';

// Daily tracking (in-memory for now, should be database in production)
let dailyNotional = 0;
let tickerExposure = new Map();

function alpacaRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(ALPACA_BASE + path);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(`Alpaca API error: ${res.statusCode} - ${responseData}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Alpaca response: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Alpaca request timeout'));
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

router.post('/orders/create', async (req, res) => {
  try {
    console.log('📈 Orders: Creating order with payload:', req.body);
    
    const { ticker, usd_amount, current_price, tp1_pct=0.15, tp2_pct=0.50, stop_pct=0.10 } = req.body || {};
    
    if (!ticker || !usd_amount || !current_price) {
      return res.status(400).json({ 
        ok: false, 
        error: 'ticker, usd_amount, current_price required' 
      });
    }

    // Guardrails enforcement (applies even in dry-run mode for testing)
    
    // 1. Trading window check (ET timezone)
    const now = new Date();
    const etHour = now.getUTCHours() - 5; // EST/EDT approximation
    const etMinute = now.getUTCMinutes();
    const currentTimeET = `${String(etHour).padStart(2, '0')}:${String(etMinute).padStart(2, '0')}`;
    
    if (currentTimeET < TRADE_START_ET || currentTimeET > TRADE_END_ET) {
      return res.status(403).json({
        ok: false,
        error: `Outside trading window (${TRADE_START_ET}-${TRADE_END_ET} ET)`,
        current_time_et: currentTimeET
      });
    }

    // 2. Bracket parameters validation
    if (tp1_pct < 0.05 || tp1_pct > 0.25 || tp2_pct < 0.20 || tp2_pct > 1.00 || stop_pct < 0.03 || stop_pct > 0.25) {
      return res.status(400).json({
        ok: false,
        error: 'Bracket params out of safe range (TP1: 5-25%, TP2: 20-100%, SL: 3-25%)'
      });
    }

    // 3. Daily notional cap
    if (dailyNotional + usd_amount > MAX_DAILY_NOTIONAL) {
      return res.status(403).json({
        ok: false,
        error: `Daily notional cap exceeded ($${dailyNotional + usd_amount} > $${MAX_DAILY_NOTIONAL})`
      });
    }

    // 4. Per-ticker exposure cap
    const currentExposure = tickerExposure.get(ticker) || 0;
    if (currentExposure + usd_amount > MAX_TICKER_EXPOSURE) {
      return res.status(403).json({
        ok: false,
        error: `Max exposure exceeded for ${ticker} ($${currentExposure + usd_amount} > $${MAX_TICKER_EXPOSURE})`
      });
    }
    
    // Split into two brackets: TP1 (50%) + TP2 (50%) sharing the same stop
    const notional1 = Math.max(1, Math.round((usd_amount/2) * 100) / 100);
    const notional2 = Math.max(1, Math.round((usd_amount/2) * 100) / 100);

    const makeOrder = (notional, tpPct) => {
      const takePrice = +(current_price * (1 + tpPct)).toFixed(2);
      const stopPrice = +(current_price * (1 - stop_pct)).toFixed(2);

      // Prefer fractional qty if supported; else derive whole shares
      let body = {
        symbol: ticker,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        take_profit: { limit_price: takePrice },
        stop_loss: { stop_price: stopPrice }
      };
      
      if (ACCOUNT_SUPPORTS_FRACTIONAL) {
        // fractional qty: qty supports decimals; pick qty from notional/current_price
        const qty = +(notional / current_price).toFixed(3);
        body.qty = String(qty);
      } else {
        const qty = Math.max(1, Math.floor(notional / current_price));
        body.qty = String(qty);
      }
      return body;
    };

    const order1 = makeOrder(notional1, tp1_pct);
    const order2 = makeOrder(notional2, tp2_pct);

    console.log(`💰 Orders: ${ticker} - $${usd_amount} split into 2 brackets (TP1: ${(tp1_pct*100).toFixed(0)}%, TP2: ${(tp2_pct*100).toFixed(0)}%, SL: ${(stop_pct*100).toFixed(0)}%)`);

    if (!ORDERS_ENABLED) {
      console.log('🔒 Orders: ORDERS_ENABLED=0, returning dry run');
      return res.json({ 
        ok: true, 
        dry_run: true, 
        orders: [order1, order2],
        message: `Dry run: Would place 2 bracket orders for ${ticker} totaling $${usd_amount}`
      });
    }

    console.log('🚀 Orders: ORDERS_ENABLED=1, placing live orders');
    
    // Place both bracket orders
    const [r1, r2] = await Promise.all([
      alpacaRequest('/v2/orders', 'POST', order1),
      alpacaRequest('/v2/orders', 'POST', order2)
    ]);
    
    console.log(`✅ Orders: Successfully placed 2 orders for ${ticker} - IDs: ${r1.id}, ${r2.id}`);
    
    // Update tracking after successful orders
    dailyNotional += usd_amount;
    tickerExposure.set(ticker, (tickerExposure.get(ticker) || 0) + usd_amount);
    
    return res.json({ 
      ok: true, 
      dry_run: false, 
      orders: [r1, r2],
      message: `Placed 2 bracket orders for ${ticker} totaling $${usd_amount}`
    });

  } catch (e) {
    console.error('❌ Order error:', e.message);
    res.status(500).json({ 
      ok: false, 
      error: String(e.message || e),
      message: 'Failed to place order'
    });
  }
});

/**
 * GET /api/orders/recent
 * Get recent orders for display
 */
router.get('/orders/recent', async (req, res) => {
  try {
    if (!ORDERS_ENABLED) {
      return res.json({ 
        orders: [],
        message: 'Orders disabled (ORDERS_ENABLED=0)'
      });
    }
    
    const orders = await alpacaRequest('/v2/orders?status=all&limit=20');
    
    // Transform to simplified format
    const recentOrders = orders.map(order => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      status: order.status,
      created_at: order.created_at,
      filled_at: order.filled_at,
      order_class: order.order_class
    }));
    
    res.json({ orders: recentOrders });
    
  } catch (error) {
    console.error('❌ Recent orders error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get recent orders',
      message: error.message 
    });
  }
});

/**
 * POST /api/alerts/test
 * Test alerts functionality
 */
router.post('/alerts/test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'phone and message required'
      });
    }
    
    console.log(`📱 Alert test: ${phone} - ${message}`);
    
    // For now, just log and return success
    // TODO: Implement actual SMS/alert service integration
    
    res.json({
      success: true,
      message: 'Test alert logged successfully',
      phone,
      alert_message: message
    });
    
  } catch (error) {
    console.error('❌ Alert test error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to send test alert',
      message: error.message
    });
  }
});

// Enhanced Trading API with Alpaca Paper Integration
const alpacaTrading = new AlpacaPaperTrading();

/**
 * POST /api/orders/trade - Simple trade execution
 * For basic buy/sell orders from UI buttons
 */
router.post('/trade', async (req, res) => {
  try {
    const { ticker, side, qty, type = 'market' } = req.body;

    if (!ticker || !side || !qty) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ticker, side, qty'
      });
    }

    if (!ORDERS_ENABLED) {
      return res.json({
        success: true,
        dry_run: true,
        message: `DRY RUN: Would ${side.toUpperCase()} ${qty} shares of ${ticker}`,
        note: 'Set ORDERS_ENABLED=1 to enable live trading'
      });
    }

    console.log(`🎯 Trade Request: ${side.toUpperCase()} ${qty} shares of ${ticker}`);

    // Execute trade via Alpaca Paper API
    const result = await alpacaTrading.createOrder(ticker, side, qty, type);

    if (result.success) {
      res.json({
        success: true,
        order: result.order,
        message: `${side.toUpperCase()} order for ${qty} shares of ${ticker} executed successfully`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Trade execution error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/orders/portfolio - Get current portfolio from Alpaca
 */
router.get('/portfolio', async (req, res) => {
  try {
    const [accountResult, positionsResult] = await Promise.all([
      alpacaTrading.getAccount(),
      alpacaTrading.getPositions()
    ]);

    if (!accountResult.success) {
      return res.status(500).json({
        success: false,
        error: `Account fetch failed: ${accountResult.error}`
      });
    }

    if (!positionsResult.success) {
      return res.status(500).json({
        success: false,
        error: `Positions fetch failed: ${positionsResult.error}`
      });
    }

    res.json({
      success: true,
      account: accountResult.account,
      positions: positionsResult.positions,
      summary: {
        total_positions: positionsResult.positions.length,
        total_value: accountResult.account.portfolio_value,
        cash: accountResult.account.cash,
        buying_power: accountResult.account.buying_power
      }
    });

  } catch (error) {
    console.error('❌ Portfolio fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/orders/history - Get recent orders
 */
router.get('/history', async (req, res) => {
  try {
    const { limit = 20, status = 'all' } = req.query;
    
    const result = await alpacaTrading.getOrders(status, parseInt(limit));

    if (result.success) {
      res.json({
        success: true,
        orders: result.orders
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Order history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/orders/cancel/:orderId - Cancel an order
 */
router.delete('/cancel/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const result = await alpacaTrading.cancelOrder(orderId);

    if (result.success) {
      res.json({
        success: true,
        message: `Order ${orderId} cancelled successfully`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Order cancellation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;