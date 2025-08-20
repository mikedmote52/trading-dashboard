const express = require('express');
const https = require('https');
const router = express.Router();

const ORDERS_ENABLED = (process.env.ORDERS_ENABLED || '0') === '1';
const ALPACA_KEY = process.env.APCA_API_KEY_ID;
const ALPACA_SECRET = process.env.APCA_API_SECRET_KEY;
const ALPACA_BASE = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
const ACCOUNT_SUPPORTS_FRACTIONAL = true; // set false if your account doesn't

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

module.exports = router;