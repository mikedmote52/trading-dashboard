const express = require("express");
const router = express.Router();

// Import shared positions store from order.js
const orderModule = require('./order');
const positions = orderModule.positions;

// GET /api/portfolio/positions - List all positions
router.get("/positions", (req, res) => {
  try {
    const allPositions = Array.from(positions.values());
    res.json({ 
      ok: true, 
      positions: allPositions,
      count: allPositions.length,
      success: true
    });
  } catch (error) {
    console.error('❌ Portfolio positions error:', error);
    res.status(500).json({
      ok: false,
      success: false,
      error: error.message,
      positions: [],
      count: 0
    });
  }
});

// POST /api/portfolio/fills - Webhook handler for order fills
router.post("/fills", (req, res) => {
  try {
    console.log('📦 Fill webhook received:', JSON.stringify(req.body, null, 2));
    
    const { order_id, ticker, qty, avg_cost, filled_at } = req.body;
    
    // Validate required fields
    if (!order_id || !ticker) {
      return res.status(400).json({ 
        success: false, 
        error: "order_id and ticker required" 
      });
    }
    
    // Find position by order_id
    let positionRecord = null;
    for (const [posId, pos] of positions.entries()) {
      if (pos.alpaca_order_id === order_id) {
        positionRecord = pos;
        break;
      }
    }
    
    if (!positionRecord) {
      console.warn(`⚠️ No position found for order ${order_id}`);
      return res.status(404).json({ 
        success: false, 
        error: "Position not found for order_id" 
      });
    }
    
    // Update position with fill data
    positionRecord.filled_qty = qty || positionRecord.qty;
    positionRecord.filled_avg_price = avg_cost || positionRecord.ref_price;
    positionRecord.filled_at = filled_at || new Date().toISOString();
    positionRecord.status = 'filled';
    
    console.log(`✅ Updated position ${positionRecord.id} with fill data`);
    
    res.json({
      success: true,
      message: "Fill recorded successfully",
      position_id: positionRecord.id,
      updated_fields: {
        filled_qty: positionRecord.filled_qty,
        filled_avg_price: positionRecord.filled_avg_price,
        filled_at: positionRecord.filled_at,
        status: positionRecord.status
      }
    });
    
  } catch (error) {
    console.error('❌ Fill webhook error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add a helper to share positions with order.js
router.getPositionsStore = () => positions;

module.exports = router;