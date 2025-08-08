const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { assertPaperMode, canPlaceBuy } = require('../policy');
const { insertDecision, insertOrder } = require('../db/sqlite');
const { getAccount, getPositions, placeOrder, getQuote } = require('../services/alpaca');

/**
 * Calculate today's drawdown from account data
 */
function calculateTodaysDrawdown(account) {
  // If we have last_equity from previous close
  const lastEquity = account.last_equity || account.equity;
  const currentEquity = account.equity;
  return Math.max(0, (lastEquity - currentEquity) / lastEquity);
}

/**
 * POST /api/trade/buy
 * Buy a position with policy checks
 */
router.post('/buy', async (req, res) => {
  try {
    const { symbol, dollars, features, confidence, notes } = req.body;
    
    // Validate inputs
    if (!symbol || !dollars) {
      return res.status(400).json({ error: 'Missing required fields: symbol, dollars' });
    }
    
    // Check paper mode
    assertPaperMode();
    
    // Get account and positions
    const [account, positions, quote] = await Promise.all([
      getAccount(),
      getPositions(),
      getQuote(symbol)
    ]);
    
    // Calculate current exposure to this symbol
    const currentPosition = positions.find(p => p.symbol === symbol);
    const symbolExposure = currentPosition ? currentPosition.market_value : 0;
    
    // Apply policy checks
    const policyCheck = canPlaceBuy({
      portfolioValue: account.portfolio_value,
      symbolExposure,
      intendedCost: dollars,
      todaysDrawdown: calculateTodaysDrawdown(account)
    });
    
    if (!policyCheck.ok) {
      return res.status(403).json({ 
        error: 'Policy violation',
        reason: policyCheck.reason 
      });
    }
    
    // Calculate quantity based on current ask price
    const price = quote.ask || quote.bid || 0;
    if (price <= 0) {
      return res.status(400).json({ error: 'Unable to determine current price' });
    }
    
    const qty = Math.floor(dollars / price);
    if (qty < 1) {
      return res.status(400).json({ error: 'Insufficient dollars for even 1 share' });
    }
    
    // Generate decision ID
    const decisionId = uuidv4();
    
    // Record decision
    insertDecision.run({
      id: decisionId,
      kind: 'buy',
      symbol,
      ts: Date.now(),
      policy: JSON.stringify(policyCheck),
      features: features ? JSON.stringify(features) : null,
      recommendation: 'buy',
      confidence: confidence || 0.5,
      notes: notes || null
    });
    
    // Place order
    const order = await placeOrder({
      symbol,
      qty,
      side: 'buy'
    });
    
    // Record order
    insertOrder.run({
      id: order.id,
      decision_id: decisionId,
      symbol,
      side: 'buy',
      qty,
      avg_price: order.filled_avg_price || price,
      status: order.status,
      ts: Date.now(),
      raw: JSON.stringify(order.raw)
    });
    
    // Return success response
    res.json({
      ok: true,
      decision_id: decisionId,
      order: {
        id: order.id,
        status: order.status,
        qty: order.qty,
        estimated_cost: qty * price
      }
    });
    
  } catch (error) {
    console.error('Buy order error:', error);
    res.status(500).json({ 
      error: 'Failed to place buy order',
      message: error.message 
    });
  }
});

/**
 * POST /api/trade/sell
 * Sell a position
 */
router.post('/sell', async (req, res) => {
  try {
    const { symbol, qty, notes } = req.body;
    
    // Validate inputs
    if (!symbol || !qty) {
      return res.status(400).json({ error: 'Missing required fields: symbol, qty' });
    }
    
    // Check paper mode
    assertPaperMode();
    
    // Get positions to verify we have shares to sell
    const positions = await getPositions();
    const position = positions.find(p => p.symbol === symbol);
    
    if (!position) {
      return res.status(400).json({ error: 'No position found for symbol' });
    }
    
    if (position.qty < qty) {
      return res.status(400).json({ 
        error: 'Insufficient shares',
        available: position.qty,
        requested: qty 
      });
    }
    
    // Generate decision ID
    const decisionId = uuidv4();
    
    // Record decision
    insertDecision.run({
      id: decisionId,
      kind: 'sell',
      symbol,
      ts: Date.now(),
      policy: null,
      features: null,
      recommendation: 'sell',
      confidence: null,
      notes: notes || null
    });
    
    // Place order
    const order = await placeOrder({
      symbol,
      qty,
      side: 'sell'
    });
    
    // Record order
    insertOrder.run({
      id: order.id,
      decision_id: decisionId,
      symbol,
      side: 'sell',
      qty,
      avg_price: order.filled_avg_price || 0,
      status: order.status,
      ts: Date.now(),
      raw: JSON.stringify(order.raw)
    });
    
    // Return success response
    res.json({
      ok: true,
      decision_id: decisionId,
      order: {
        id: order.id,
        status: order.status,
        qty: order.qty
      }
    });
    
  } catch (error) {
    console.error('Sell order error:', error);
    res.status(500).json({ 
      error: 'Failed to place sell order',
      message: error.message 
    });
  }
});

/**
 * POST /api/trade/adjust
 * Adjust a position (increase or decrease)
 */
router.post('/adjust', async (req, res) => {
  try {
    const { symbol, deltaQty, notes } = req.body;
    
    // Validate inputs
    if (!symbol || deltaQty === undefined) {
      return res.status(400).json({ error: 'Missing required fields: symbol, deltaQty' });
    }
    
    // Check paper mode
    assertPaperMode();
    
    // Get account and positions
    const [account, positions] = await Promise.all([
      getAccount(),
      getPositions()
    ]);
    
    const position = positions.find(p => p.symbol === symbol);
    
    // Determine if buying or selling
    const side = deltaQty > 0 ? 'buy' : 'sell';
    const absQty = Math.abs(deltaQty);
    
    // If buying, apply policy checks
    if (side === 'buy') {
      const quote = await getQuote(symbol);
      const price = quote.ask || quote.bid || 0;
      const dollars = absQty * price;
      
      const symbolExposure = position ? position.market_value : 0;
      
      const policyCheck = canPlaceBuy({
        portfolioValue: account.portfolio_value,
        symbolExposure,
        intendedCost: dollars,
        todaysDrawdown: calculateTodaysDrawdown(account)
      });
      
      if (!policyCheck.ok) {
        return res.status(403).json({ 
          error: 'Policy violation',
          reason: policyCheck.reason 
        });
      }
    } else {
      // If selling, verify we have shares
      if (!position || position.qty < absQty) {
        return res.status(400).json({ 
          error: 'Insufficient shares',
          available: position ? position.qty : 0,
          requested: absQty 
        });
      }
    }
    
    // Generate decision ID
    const decisionId = uuidv4();
    
    // Record decision
    insertDecision.run({
      id: decisionId,
      kind: 'adjust',
      symbol,
      ts: Date.now(),
      policy: side === 'buy' ? JSON.stringify({ deltaQty }) : null,
      features: null,
      recommendation: side,
      confidence: null,
      notes: notes || `Adjust position by ${deltaQty > 0 ? '+' : ''}${deltaQty}`
    });
    
    // Place order
    const order = await placeOrder({
      symbol,
      qty: absQty,
      side
    });
    
    // Record order
    insertOrder.run({
      id: order.id,
      decision_id: decisionId,
      symbol,
      side,
      qty: absQty,
      avg_price: order.filled_avg_price || 0,
      status: order.status,
      ts: Date.now(),
      raw: JSON.stringify(order.raw)
    });
    
    // Return success response
    res.json({
      ok: true,
      decision_id: decisionId,
      order: {
        id: order.id,
        status: order.status,
        qty: absQty,
        side
      }
    });
    
  } catch (error) {
    console.error('Adjust order error:', error);
    res.status(500).json({ 
      error: 'Failed to adjust position',
      message: error.message 
    });
  }
});

module.exports = router;