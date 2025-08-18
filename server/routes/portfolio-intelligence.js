// Portfolio Intelligence API Routes - Feature 5: Portfolio analysis with discovery scores
const express = require('express');
const router = express.Router();

// GET /api/portfolio-intelligence/analyze - Analyze current portfolio
router.get('/analyze', async (req, res) => {
  try {
    if (!req.app.locals.portfolioIntelligence || !req.app.locals.portfolioIntelligence.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Portfolio intelligence not enabled',
        note: 'Set PORTFOLIO_INTELLIGENCE=true to enable portfolio analysis'
      });
    }
    
    const intelligence = req.app.locals.portfolioIntelligence;
    
    console.log('🧠 Starting portfolio intelligence analysis...');
    const analysis = await intelligence.analyzePortfolio();
    
    res.json({
      success: true,
      ...analysis
    });
    
  } catch (error) {
    console.error('❌ Portfolio analysis error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/portfolio-intelligence/summary - Get portfolio insights summary
router.get('/summary', async (req, res) => {
  try {
    if (!req.app.locals.portfolioIntelligence || !req.app.locals.portfolioIntelligence.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Portfolio intelligence not enabled'
      });
    }
    
    const intelligence = req.app.locals.portfolioIntelligence;
    const summary = intelligence.getInsightsSummary();
    
    res.json({
      success: true,
      summary,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Portfolio summary error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/portfolio-intelligence/history - Get historical analysis
router.get('/history', async (req, res) => {
  try {
    if (!req.app.locals.portfolioIntelligence || !req.app.locals.portfolioIntelligence.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Portfolio intelligence not enabled'
      });
    }
    
    const { days = 30 } = req.query;
    const intelligence = req.app.locals.portfolioIntelligence;
    const history = intelligence.getPortfolioHistory(parseInt(days));
    
    res.json({
      success: true,
      history,
      days: parseInt(days),
      count: history.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Portfolio history error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/portfolio-intelligence/refresh - Refresh portfolio analysis
router.post('/refresh', async (req, res) => {
  try {
    if (!req.app.locals.portfolioIntelligence || !req.app.locals.portfolioIntelligence.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Portfolio intelligence not enabled'
      });
    }
    
    const intelligence = req.app.locals.portfolioIntelligence;
    
    console.log('🔄 Refreshing portfolio intelligence analysis...');
    const analysis = await intelligence.analyzePortfolio();
    
    res.json({
      success: true,
      message: 'Portfolio analysis refreshed',
      ...analysis
    });
    
  } catch (error) {
    console.error('❌ Portfolio refresh error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/portfolio-intelligence/positions - Get current positions with intelligence
router.get('/positions', async (req, res) => {
  try {
    if (!req.app.locals.portfolioIntelligence || !req.app.locals.portfolioIntelligence.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Portfolio intelligence not enabled'
      });
    }
    
    const intelligence = req.app.locals.portfolioIntelligence;
    
    // Fetch current positions from Alpaca
    const positions = await intelligence.fetchPortfolioPositions();
    
    if (positions.length === 0) {
      return res.json({
        success: true,
        positions: [],
        message: 'No open positions found'
      });
    }
    
    // Get VIGL scores for symbols
    const symbols = positions.map(p => p.symbol);
    const viglScores = await intelligence.getViglScores(symbols);
    
    // Enrich positions with VIGL data
    const enrichedPositions = positions.map(position => ({
      ...position,
      vigl_data: viglScores[position.symbol] || null,
      unrealized_pnl_pct: parseFloat(position.unrealized_plpc) * 100
    }));
    
    res.json({
      success: true,
      positions: enrichedPositions,
      count: enrichedPositions.length,
      vigl_coverage: symbols.filter(s => viglScores[s]).length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Positions fetch error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/portfolio-intelligence/insights/:symbol - Get insights for specific symbol
router.get('/insights/:symbol', async (req, res) => {
  try {
    if (!req.app.locals.portfolioIntelligence || !req.app.locals.portfolioIntelligence.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Portfolio intelligence not enabled'
      });
    }
    
    const { symbol } = req.params;
    const intelligence = req.app.locals.portfolioIntelligence;
    
    // Get current positions
    const positions = await intelligence.fetchPortfolioPositions();
    const position = positions.find(p => p.symbol === symbol.toUpperCase());
    
    if (!position) {
      return res.status(404).json({
        success: false,
        error: `No position found for symbol ${symbol}`
      });
    }
    
    // Get VIGL data
    const viglScores = await intelligence.getViglScores([symbol]);
    const viglData = viglScores[symbol.toUpperCase()];
    
    // Analyze position
    const analysis = await intelligence.analyzePosition(position, viglData);
    
    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      analysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Symbol insights error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/portfolio-intelligence/test - Test with mock data
router.post('/test', async (req, res) => {
  try {
    if (!req.app.locals.portfolioIntelligence || !req.app.locals.portfolioIntelligence.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'Portfolio intelligence not enabled'
      });
    }
    
    // Mock portfolio data for testing
    const mockPositions = [
      {
        symbol: 'QUBT',
        qty: '50',
        avg_cost: '18.45',
        current_price: '21.30',
        market_value: '1065.00',
        unrealized_pl: '142.50',
        unrealized_plpc: '0.1543',
        side: 'long'
      },
      {
        symbol: 'RGTI',
        qty: '100',
        avg_cost: '3.22',
        current_price: '2.89',
        market_value: '289.00',
        unrealized_pl: '-33.00',
        unrealized_plpc: '-0.1025',
        side: 'long'
      },
      {
        symbol: 'VIGL',
        qty: '75',
        avg_cost: '4.18',
        current_price: '4.89',
        market_value: '366.75',
        unrealized_pl: '53.25',
        unrealized_plpc: '0.1699',
        side: 'long'
      }
    ];
    
    const intelligence = req.app.locals.portfolioIntelligence;
    
    // Update mock positions
    await intelligence.updatePositions(mockPositions);
    
    // Get VIGL scores
    const symbols = mockPositions.map(p => p.symbol);
    const viglScores = await intelligence.getViglScores(symbols);
    
    // Analyze positions
    const analyzedPositions = [];
    for (const position of mockPositions) {
      const analysis = await intelligence.analyzePosition(position, viglScores[position.symbol]);
      analyzedPositions.push(analysis);
      await intelligence.storePositionAnalysis(analysis);
    }
    
    // Calculate summary
    const summary = intelligence.calculatePortfolioSummary(analyzedPositions);
    
    res.json({
      success: true,
      message: 'Test analysis completed with mock data',
      positions: analyzedPositions,
      summary,
      vigl_scores: viglScores,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Portfolio test error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;