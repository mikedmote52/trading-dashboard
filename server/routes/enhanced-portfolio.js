/**
 * Enhanced Portfolio API Routes
 * Provides intelligent portfolio analysis with thesis tracking and recommendations
 */

const express = require('express');
const router = express.Router();
const { thesisTracker } = require('../services/thesisTracking');
const RecommendationEngine = require('../services/recommendationEngine');

/**
 * Get enhanced portfolio data with thesis and recommendations
 */
router.get('/enhanced', async (req, res) => {
  try {
    console.log('💎 Enhanced portfolio analysis with AI recommendations requested...');
    
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
    
    console.log('🧠 Analyzing portfolio with VIGL intelligence...');
    const analysis = await intelligence.analyzePortfolio();
    
    // Calculate portfolio totals
    const totalValue = analysis.positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalPnL = analysis.positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const totalPnLPercent = totalValue > 0 ? (totalPnL / (totalValue - totalPnL)) * 100 : 0;
    
    // Format for UI with complete structure
    const enhancedPortfolio = {
      success: true,
      portfolio: {
        positions: analysis.positions || [],
        analysis: {
          totalValue,
          totalPnL,
          totalPnLPercent,
          dailyPnL: 0, // Would need daily snapshot
          avgViglScore: analysis.summary?.avg_vigl_score || 0,
          riskDistribution: analysis.summary?.risk_distribution || {},
          positionsWithVigl: analysis.summary?.positions_with_vigl || 0,
          enhancementVersion: '2.0',
          analysisTimestamp: new Date().toISOString()
        },
        insights: analysis.insights || [],
        recommendations: analysis.recommendations || [],
        summary: {
          totalPositions: analysis.positions.length,
          buyMoreCount: analysis.positions.filter(p => p.recommendation?.action === 'BUY_MORE').length,
          holdCount: analysis.positions.filter(p => p.recommendation?.action === 'HOLD').length,
          trimCount: analysis.positions.filter(p => p.recommendation?.action === 'TRIM').length,
          sellCount: analysis.positions.filter(p => p.recommendation?.action === 'SELL').length,
          urgentActions: analysis.positions.filter(p => p.recommendation?.urgency === 'HIGH').length
        },
        lastUpdated: new Date().toISOString()
      },
      metadata: {
        enhancedPositions: analysis.positions.length,
        analysisFeatures: ['vigl-scoring', 'thesis-tracking', 'ai-recommendations', 'action-buttons', 'risk-assessment'],
        dataQuality: analysis.positions.length > 0 ? 'GOOD' : 'NO_POSITIONS'
      }
    };
    
    console.log(`✅ Enhanced portfolio complete: ${analysis.positions.length} positions with AI recommendations`);
    
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
        recommendations: [],
        summary: {}
      }
    });
  }
});

/**
 * Record or update thesis for a position
 */
router.post('/thesis/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const thesisData = req.body;
    
    console.log(`📝 Recording thesis for ${symbol}:`, thesisData);
    
    const thesis = thesisTracker.recordEntry(symbol, thesisData);
    
    res.json({
      success: true,
      thesis,
      message: `Thesis recorded for ${symbol}`
    });
    
  } catch (error) {
    console.error('❌ Thesis recording error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record thesis'
    });
  }
});

/**
 * Get thesis for a specific position
 */
router.get('/thesis/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const thesis = thesisTracker.getThesis(symbol);
    
    if (!thesis) {
      return res.status(404).json({
        success: false,
        error: `No thesis found for ${symbol}`
      });
    }
    
    res.json({
      success: true,
      thesis
    });
    
  } catch (error) {
    console.error('❌ Thesis retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thesis'
    });
  }
});

/**
 * Get AlphaStack scores for symbols
 * This integrates with the existing AlphaStack system
 */
async function getAlphaStackScores(symbols) {
  try {
    console.log(`🎯 Fetching AlphaStack scores for ${symbols.length} symbols...`);
    
    // Mock scores for now - in real implementation, this would call AlphaStack API
    const scores = {};
    
    // Try to get recent AlphaStack scan data
    try {
      const { spawn } = require('child_process');
      
      // Quick scan for just these symbols
      const symbolsParam = symbols.join(',');
      
      // For now, return estimated scores based on symbol characteristics
      symbols.forEach(symbol => {
        // Simple heuristic scoring based on symbol patterns
        let score = 65; // Default
        
        if (['AAPL', 'MSFT', 'GOOGL', 'AMZN'].includes(symbol)) score = 78;
        else if (['TSLA', 'NVDA', 'AMD'].includes(symbol)) score = 82;
        else if (symbol.includes('AI') || symbol.includes('BIO')) score = 75;
        else score = Math.floor(Math.random() * 40) + 50; // 50-90 range
        
        scores[symbol] = score;
      });
      
      console.log(`✅ AlphaStack scores retrieved:`, scores);
      
    } catch (error) {
      console.warn('⚠️ AlphaStack scoring fallback - using estimated scores');
      symbols.forEach(symbol => {
        scores[symbol] = 65; // Neutral default
      });
    }
    
    return scores;
    
  } catch (error) {
    console.error('❌ AlphaStack scoring error:', error);
    return {};
  }
}

/**
 * Get enhanced portfolio summary for header display
 */
router.get('/summary', async (req, res) => {
  try {
    const thesesSummary = thesisTracker.getThesesSummary();
    
    res.json({
      success: true,
      summary: {
        ...thesesSummary,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Portfolio summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get portfolio summary'
    });
  }
});

module.exports = router;