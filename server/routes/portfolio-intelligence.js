// Portfolio Intelligence API Routes - Feature 5: Portfolio analysis with discovery scores
const express = require('express');
const router = express.Router();
const { evaluatePosition } = require('../../src/portfolio/position-health');
const fetch = require('node-fetch');

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

// GET /api/enhanced-portfolio/enhanced - Get enhanced portfolio for UI
router.get('/enhanced', async (req, res) => {
  try {
    // Initialize portfolio intelligence if not already done
    if (!req.app.locals.portfolioIntelligence) {
      const PortfolioIntelligence = require('../services/portfolio-intelligence');
      req.app.locals.portfolioIntelligence = new PortfolioIntelligence();
    }
    
    const intelligence = req.app.locals.portfolioIntelligence;
    
    // Always enable for enhanced endpoint
    if (!intelligence.isEnabled) {
      intelligence.isEnabled = true;
      intelligence.initializeDatabase();
    }
    
    console.log('💎 Getting enhanced portfolio with thesis and recommendations...');
    const analysis = await intelligence.analyzePortfolio();
    
    // Format for UI with proper structure
    const enhancedPortfolio = {
      success: true,
      portfolio: {
        positions: analysis.positions || [],
        analysis: {
          totalValue: analysis.summary?.total_value || 0,
          totalPnL: analysis.summary?.total_pnl || 0,
          totalPnLPercent: analysis.summary?.total_pnl_pct || 0,
          avgViglScore: analysis.summary?.avg_vigl_score || 0,
          riskDistribution: analysis.summary?.risk_distribution || {}
        },
        insights: analysis.insights || [],
        recommendations: analysis.recommendations || [],
        lastUpdated: new Date().toISOString()
      }
    };
    
    res.json(enhancedPortfolio);
    
  } catch (error) {
    console.error('❌ Enhanced portfolio error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      portfolio: {
        positions: [],
        analysis: {},
        insights: [],
        recommendations: []
      }
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

// GET /api/portfolio-intelligence/positions/health - Enhanced position health analysis
router.get('/positions/health', async (req, res) => {
  try {
    console.log('🔍 Starting enhanced position health analysis...');
    
    // Get positions using direct HTTP call to Alpaca
    const positions = await getAlpacaPositions();
    console.log(`📊 Found ${positions.length} positions to analyze`);
    
    if (positions.length === 0) {
      return res.json({
        success: true,
        positions: [],
        message: 'No open positions found'
      });
    }
    
    // Evaluate each position using screener logic
    const healthAnalysis = await Promise.all(
      positions.map(async (position) => {
        try {
          // Pass P&L data to position evaluator
          const health = await evaluatePosition(position.symbol, parseFloat(position.market_price), {
              unrealizedPLPercent: parseFloat(position.unrealized_plpc) * 100
          });
          
          // Merge position data with health analysis
          return {
            // Core position data (fixed field mapping)
            symbol: position.symbol,
            shares: parseFloat(position.qty),
            avgCost: parseFloat(position.avg_entry_price),
            lastPrice: parseFloat(position.market_price),
            marketValue: parseFloat(position.market_value),
            unrealizedPL: parseFloat(position.unrealized_pl),
            unrealizedPLPercent: parseFloat(position.unrealized_plpc) * 100,
            
            // Health analysis
            score: health.score,
            action: health.action,
            thesis: health.thesis,
            
            // Technical signals
            signals: {
              relVol: health.metrics.relVol,
              aboveVWAP: health.metrics.aboveVWAP,
              vwapReclaim: health.metrics.vwapReclaim,
              emaCross: health.metrics.emaCross,
              rsi: health.metrics.rsi,
              atrPct: health.metrics.atrPct
            },
            
            // Catalyst information
            catalyst: health.catalyst,
            
            // Risk management
            risk: health.risk,
            
            // Options sentiment
            options: health.options,
            
            timestamp: health.timestamp,
            error: health.error
          };
        } catch (error) {
          console.error(`❌ Error analyzing ${position.symbol}:`, error);
          return {
            symbol: position.symbol,
            shares: parseFloat(position.qty),
            avgCost: parseFloat(position.avg_entry_price),
            lastPrice: parseFloat(position.market_price),
            marketValue: parseFloat(position.market_value),
            unrealizedPL: parseFloat(position.unrealized_pl),
            unrealizedPLPercent: parseFloat(position.unrealized_plpc) * 100,
            score: 50,
            action: 'MONITOR',
            thesis: 'Analysis failed',
            error: error.message
          };
        }
      })
    );
    
    res.json({
      success: true,
      positions: healthAnalysis,
      count: healthAnalysis.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Position health analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/portfolio-intelligence/portfolio/health - Portfolio-level health summary
router.get('/portfolio/health', async (req, res) => {
  try {
    console.log('📊 Calculating portfolio-level health metrics...');
    
    // Get positions and account info using direct HTTP calls
    const [positions, account] = await Promise.all([
      getAlpacaPositions(),
      getAlpacaAccount()
    ]);
    
    if (positions.length === 0) {
      return res.json({
        success: true,
        totalValue: parseFloat(account.portfolio_value),
        cash: parseFloat(account.cash),
        positions: 0,
        weightedScore: 0,
        status: 'NO_POSITIONS'
      });
    }
    
    // Calculate portfolio metrics
    const totalPortfolioValue = parseFloat(account.portfolio_value);
    const totalPositionValue = positions.reduce((sum, pos) => sum + parseFloat(pos.market_value), 0);
    const cashAmount = parseFloat(account.cash);
    
    // Get position health scores
    const healthResults = await Promise.all(
      positions.map(async (pos) => {
        try {
          const health = await evaluatePosition(pos.symbol, parseFloat(pos.market_price));
          return {
            symbol: pos.symbol,
            value: parseFloat(pos.market_value),
            score: health.score,
            action: health.action
          };
        } catch (error) {
          return {
            symbol: pos.symbol,
            value: parseFloat(pos.market_value),
            score: 50,
            action: 'MONITOR'
          };
        }
      })
    );
    
    // Calculate weighted average score
    const weightedScore = healthResults.reduce((sum, pos) => {
      return sum + (pos.score * pos.value);
    }, 0) / Math.max(1, totalPositionValue);
    
    // Count position actions
    const actionCounts = healthResults.reduce((counts, pos) => {
      counts[pos.action] = (counts[pos.action] || 0) + 1;
      return counts;
    }, {});
    
    // Calculate concentration (largest position %)
    const largestPosition = Math.max(...healthResults.map(pos => pos.value));
    const concentration = (largestPosition / totalPositionValue) * 100;
    
    // Determine overall portfolio status
    let portfolioStatus = 'HEALTHY';
    if (weightedScore < 60) portfolioStatus = 'NEEDS_ATTENTION';
    else if (weightedScore < 70) portfolioStatus = 'MONITOR';
    else if (weightedScore >= 80) portfolioStatus = 'STRONG';
    
    // Risk flags
    const riskFlags = [];
    if (concentration > 25) riskFlags.push('HIGH_CONCENTRATION');
    if (actionCounts.TRIM_OR_EXIT > 0) riskFlags.push('EXIT_SIGNALS');
    if (weightedScore < 60) riskFlags.push('LOW_HEALTH_SCORE');
    if (cashAmount / totalPortfolioValue < 0.05) riskFlags.push('LOW_CASH');
    
    res.json({
      success: true,
      totalValue: totalPortfolioValue,
      positionValue: totalPositionValue,
      cash: cashAmount,
      cashPercent: (cashAmount / totalPortfolioValue) * 100,
      positionCount: positions.length,
      weightedScore: Math.round(weightedScore),
      concentration: Math.round(concentration * 100) / 100,
      status: portfolioStatus,
      actionCounts,
      riskFlags,
      topPositions: healthResults
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map(pos => ({
          symbol: pos.symbol,
          value: pos.value,
          percent: Math.round((pos.value / totalPositionValue) * 100 * 100) / 100,
          score: pos.score,
          action: pos.action
        })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Portfolio health calculation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper functions for Alpaca API calls
async function getAlpacaPositions() {
  try {
    const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
    const response = await fetch(`${baseUrl}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': process.env.APCA_API_KEY_ID,
        'APCA-API-SECRET-KEY': process.env.APCA_API_SECRET_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching Alpaca positions:', error);
    return [];
  }
}

async function getAlpacaAccount() {
  try {
    const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
    const response = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': process.env.APCA_API_KEY_ID,
        'APCA-API-SECRET-KEY': process.env.APCA_API_SECRET_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching Alpaca account:', error);
    return {
      portfolio_value: '0',
      cash: '0'
    };
  }
}

module.exports = router;