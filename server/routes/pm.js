const express = require('express');
const router = express.Router();
const db = require('../db/sqlite');
const { plan } = require('../services/pm/pm');

// Helper to get Alpaca positions (assuming it exists)
async function getPositions() {
  try {
    const DS = require('../services/squeeze/data_sources');
    const holdings = await DS.get_portfolio_holdings();
    // Convert Set to array of position objects for compatibility
    return Array.from(holdings || []).map(symbol => ({ symbol }));
  } catch (e) {
    console.error('Error fetching positions:', e.message);
    return [];
  }
}

router.get('/plan', async (_req, res) => {
  try {
    const positions = await getPositions();
    const latest = await db.getLatestDiscoveriesForEngine(50);
    const discoveries = (latest || []).filter(r => r.symbol && r.symbol !== 'AUDIT_SUMMARY' && r.symbol !== 'AUDIT_PRE_ENRICH');
    const orders = plan(discoveries, positions, {});
    res.json({ success: true, count: orders.length, orders });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;