const express = require("express");
const crypto = require("crypto");

const router = express.Router();

// ENV: set these in your server environment
const ALPACA_KEY_ID = process.env.APCA_API_KEY_ID;
const ALPACA_SECRET_KEY = process.env.APCA_API_SECRET_KEY;
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";
const DATA_BASE = "https://data.alpaca.markets/v2";

function alpacaHeaders() {
  return {
    "APCA-API-KEY-ID": ALPACA_KEY_ID,
    "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    "Content-Type": "application/json"
  };
}

async function latestPrice(symbol) {
  // Fallback to provided price if market data not available
  try {
    const response = await fetch(`${DATA_BASE}/stocks/${symbol}/quotes/latest`, { 
      headers: alpacaHeaders() 
    });
    if (!response.ok) throw new Error("quote error");
    const json = await response.json();
    const price = json?.quote?.ap || json?.quote?.bp || json?.quote?.lp;
    if (price) return Number(price);
  } catch (error) {
    console.warn(`Failed to get latest price for ${symbol}:`, error.message);
  }
  return null;
}

// In-memory position store (replace with DB in production)
const positions = new Map();

// Export positions store for sharing with portfolio.js
module.exports.positions = positions;

router.post("/", async (req, res) => {
  try {
    console.log('📦 Order request received:', JSON.stringify(req.body, null, 2));
    
    // Validate environment
    if (!ALPACA_KEY_ID || !ALPACA_SECRET_KEY) {
      return res.status(500).json({ 
        ok: false, 
        error: "Alpaca API credentials not configured" 
      });
    }

    const { 
      ticker, 
      side = 'buy',
      usd, 
      qty,
      tp1_pct = 0.20, 
      tp2_pct = 0.50, 
      sl_pct = 0.10, 
      price: fallbackPrice,
      idempotencyKey 
    } = req.body || {};
    
    // Validate input based on side
    if (!ticker) {
      return res.status(400).json({ ok: false, error: "ticker required" });
    }
    
    if (side === 'buy') {
      if (!usd) {
        return res.status(400).json({ ok: false, error: "usd required for buy orders" });
      }
      if (usd < 10 || usd > 500) {
        return res.status(400).json({ ok: false, error: "usd must be $10–$500" });
      }
    } else if (side === 'sell') {
      if (!qty || qty <= 0) {
        return res.status(400).json({ ok: false, error: "qty required for sell orders" });
      }
    } else {
      return res.status(400).json({ ok: false, error: "side must be 'buy' or 'sell'" });
    }

    // Build order payload based on side
    let orderPayload;
    let buyQty = 0; // For position tracking
    let refPrice = null; // For position tracking
    let tp1, tp2, sl; // For position tracking
    
    if (side === 'sell') {
      console.log(`🎯 Placing SELL order: ${ticker} for ${qty} shares`);
      
      // Simple market sell order
      orderPayload = {
        symbol: ticker,
        qty: qty,
        side: "sell",
        type: "market",
        time_in_force: "day"
      };
      
      // Add idempotency key if provided
      if (idempotencyKey) {
        orderPayload.client_order_id = idempotencyKey;
      }
      
    } else {
      // Buy order with brackets
      console.log(`🎯 Placing BUY order: ${ticker} for $${usd} (TP1: ${(tp1_pct*100).toFixed(1)}%, TP2: ${(tp2_pct*100).toFixed(1)}%, SL: ${(sl_pct*100).toFixed(1)}%)`);
      
      // Get a price to compute bracket levels (prefer live)
      const livePrice = await latestPrice(ticker);
      refPrice = livePrice || Number(fallbackPrice) || null;
      
      if (!refPrice) {
        return res.status(400).json({ 
          ok: false, 
          error: "no reference price available" 
        });
      }

      console.log(`💰 Reference price for ${ticker}: $${refPrice} (${livePrice ? 'live' : 'fallback'})`);

      tp1 = +(refPrice * (1 + tp1_pct)).toFixed(2);
      tp2 = +(refPrice * (1 + tp2_pct)).toFixed(2);
      sl = +(refPrice * (1 - sl_pct)).toFixed(2);

      // Calculate share quantity from dollar amount (for bracket compatibility)
      buyQty = Math.floor(usd / refPrice);
      if (buyQty < 1) {
        return res.status(400).json({ 
          ok: false, 
          error: `Price too high for $${usd} order. Need at least $${Math.ceil(refPrice)} for 1 share.` 
        });
      }

      console.log(`🎯 Computed levels: TP1=$${tp1}, TP2=$${tp2}, SL=$${sl}, Qty=${buyQty} shares`);

      // Bracket order using share quantity (notional not supported with brackets)
      orderPayload = {
        symbol: ticker,
        qty: buyQty,
        side: "buy",
        type: "market",
        time_in_force: "day",
        order_class: "bracket",
        take_profit: { limit_price: tp1 },
        stop_loss: { stop_price: sl }
      };
    }

    console.log('📝 Alpaca order payload:', JSON.stringify(orderPayload, null, 2));

    const alpacaResponse = await fetch(`${ALPACA_BASE}/orders`, {
      method: "POST",
      headers: alpacaHeaders(),
      body: JSON.stringify(orderPayload)
    });

    const alpacaJson = await alpacaResponse.json();
    
    console.log('📊 Alpaca response:', alpacaResponse.status, JSON.stringify(alpacaJson, null, 2));
    
    if (!alpacaResponse.ok) {
      return res.status(400).json({ 
        ok: false, 
        error: alpacaJson?.message || "Alpaca order failed", 
        meta: alpacaJson 
      });
    }

    // Generate position record only for buy orders
    const position_id = "pos_" + crypto.randomBytes(6).toString("hex");
    const timestamp = new Date().toISOString();
    
    if (side === 'buy') {
      // Store position for buy orders
      const actualSpend = buyQty * refPrice;
      const positionRecord = {
        id: position_id,
        ticker: ticker,
        notional_requested: usd,
        actual_spend: actualSpend,
        qty: buyQty,
        alpaca_order_id: alpacaJson.id,
        ref_price: refPrice,
        tp1, tp2, sl,
        status: alpacaJson.status,
        created_at: timestamp,
        run_id: req.body.run_id,
        engine: req.body.engine || "python_v2"
      };
      
      positions.set(position_id, positionRecord);
    }
    
    console.log(`✅ Order placed successfully: ${ticker} (${position_id})`);

    // Success response
    const response = {
      ok: true,
      order_id: alpacaJson.id,
      side: side,
      ticker: ticker,
      qty: side === 'sell' ? qty : buyQty,
      status: alpacaJson.status,
      message: side === 'sell' 
        ? `Sell order placed: ${qty} shares of ${ticker}` 
        : `Buy order placed: ${buyQty} shares of ${ticker} for $${usd}`
    };
    
    if (side === 'buy') {
      response.position_id = position_id;
      response.portfolio_link = `/portfolio?highlight=${position_id}`;
      response.meta = { tp1, tp2, sl, ref_price: refPrice };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Order error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || "server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get position by ID (for portfolio integration)
router.get("/position/:id", (req, res) => {
  const position = positions.get(req.params.id);
  if (!position) {
    return res.status(404).json({ ok: false, error: "position not found" });
  }
  res.json({ ok: true, position });
});

// List all positions (for portfolio view)
router.get("/positions", (req, res) => {
  const allPositions = Array.from(positions.values());
  res.json({ 
    ok: true, 
    positions: allPositions,
    count: allPositions.length 
  });
});

// Note: Fill webhook moved to /api/portfolio/fills

module.exports = router;
module.exports.positions = positions;