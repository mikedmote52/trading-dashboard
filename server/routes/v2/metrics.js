const express = require('express');
const router = express.Router();

/**
 * GET /api/v2/metrics/:ticker
 * Returns detailed metrics for a specific ticker (read-only)
 */
router.get('/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        
        // TODO: Connect to real data collectors
        // For now, return null values (no fake data)
        const metricsData = {
            ticker: ticker.toUpperCase(),
            technicals: null,
            options: null,
            short: null,
            sentiment: null,
            catalyst: []
        };
        
        res.json(metricsData);
    } catch (error) {
        console.error(`Error in /api/v2/metrics/${req.params.ticker}:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch ticker metrics',
            message: error.message 
        });
    }
});

module.exports = router;