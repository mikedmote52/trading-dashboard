// Portfolio Intelligence Service - Feature 5: Link P/L with discovery scores
const fs = require('fs');
const https = require('https');

class PortfolioIntelligence {
  constructor() {
    this.isEnabled = process.env.PORTFOLIO_INTELLIGENCE === 'true';
    this.alpacaConfig = {
      apiKey: process.env.APCA_API_KEY_ID,
      secretKey: process.env.APCA_API_SECRET_KEY,
      baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets'
    };
    
    if (this.isEnabled) {
      // Use existing database
      const sqliteDb = require('../db/sqlite');
      this.db = sqliteDb.db;
      this.initializeDatabase();
      console.log('🧠 Portfolio intelligence initialized');
    } else {
      console.log('ℹ️ Portfolio intelligence disabled (set PORTFOLIO_INTELLIGENCE=true to enable)');
    }
  }
  
  initializeDatabase() {
    try {
      // Create portfolio intelligence tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          quantity REAL NOT NULL,
          avg_cost REAL NOT NULL,
          current_price REAL,
          market_value REAL,
          unrealized_pnl REAL,
          unrealized_pnl_pct REAL,
          side TEXT,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(symbol) ON CONFLICT REPLACE
        )
      `);
      
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_intelligence (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          analysis_date DATE NOT NULL,
          
          -- Current position data
          position_quantity REAL,
          position_value REAL,
          unrealized_pnl REAL,
          unrealized_pnl_pct REAL,
          
          -- VIGL discovery scores
          current_vigl_score REAL,
          discovery_confidence REAL,
          pattern_strength REAL,
          volume_analysis REAL,
          
          -- Intelligence insights
          recommendation TEXT,
          confidence_level TEXT,
          risk_assessment TEXT,
          next_target REAL,
          stop_loss_suggestion REAL,
          
          -- Performance tracking
          entry_accuracy REAL,
          hold_duration_days INTEGER,
          max_favorable_move REAL,
          max_adverse_move REAL,
          pattern_confirmation BOOLEAN,
          
          -- Action suggestions
          suggested_action TEXT,
          position_sizing_recommendation TEXT,
          exit_strategy TEXT,
          
          -- Research integration
          related_research_session TEXT,
          discovery_notes TEXT,
          
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(symbol, analysis_date) ON CONFLICT REPLACE
        )
      `);
      
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          message TEXT NOT NULL,
          priority INTEGER DEFAULT 3,
          current_value REAL,
          threshold_value REAL,
          triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          acknowledged BOOLEAN DEFAULT FALSE,
          action_taken TEXT
        )
      `);
      
      // Create indexes
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio_intelligence(symbol)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portfolio_date ON portfolio_intelligence(analysis_date)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portfolio_score ON portfolio_intelligence(current_vigl_score)`);
      
      console.log('🧠 Portfolio intelligence database schema ready');
    } catch (error) {
      console.error('❌ Failed to initialize portfolio intelligence database:', error.message);
      this.isEnabled = false;
    }
  }
  
  // Fetch current portfolio positions from Alpaca
  async fetchPortfolioPositions() {
    if (!this.alpacaConfig.apiKey || !this.alpacaConfig.secretKey) {
      throw new Error('Alpaca API credentials not configured');
    }
    
    return new Promise((resolve, reject) => {
      const url = new URL(this.alpacaConfig.baseUrl);
      
      const options = {
        hostname: url.hostname,
        path: '/v2/positions',
        method: 'GET',
        headers: {
          'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
          'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey,
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const positions = JSON.parse(responseData);
              resolve(positions);
            } else {
              reject(new Error(`Alpaca API error: ${res.statusCode} - ${responseData}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Alpaca response: ${e.message}`));
          }
        });
      });
      
      req.on('error', (err) => {
        reject(new Error(`Alpaca request failed: ${err.message}`));
      });
      
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Alpaca request timeout'));
      });
      
      req.end();
    });
  }
  
  // Get current VIGL scores for symbols
  async getViglScores(symbols) {
    if (!this.isEnabled) return {};
    
    try {
      // Get latest VIGL discoveries for these symbols
      const placeholders = symbols.map(() => '?').join(',');
      const query = `
        SELECT symbol, score, confidence, action, rvol, price, created_at
        FROM discoveries_vigl 
        WHERE symbol IN (${placeholders})
        ORDER BY created_at DESC
      `;
      
      const discoveries = this.db.prepare(query).all(...symbols);
      
      // Create score map - use most recent score for each symbol
      const scoreMap = {};
      discoveries.forEach(discovery => {
        if (!scoreMap[discovery.symbol]) {
          scoreMap[discovery.symbol] = {
            vigl_score: discovery.score,
            confidence: discovery.confidence,
            action: discovery.action,
            volume_factor: discovery.rvol,
            price: discovery.price,
            last_updated: discovery.created_at
          };
        }
      });
      
      return scoreMap;
    } catch (error) {
      console.error('❌ Error getting VIGL scores:', error.message);
      return {};
    }
  }
  
  // Analyze portfolio with intelligence
  async analyzePortfolio() {
    if (!this.isEnabled) {
      throw new Error('Portfolio intelligence not enabled');
    }
    
    try {
      console.log('🧠 Starting portfolio intelligence analysis...');
      
      // Fetch current positions
      const positions = await this.fetchPortfolioPositions();
      console.log(`📊 Found ${positions.length} positions to analyze`);
      
      if (positions.length === 0) {
        return {
          success: true,
          positions: [],
          summary: {
            total_positions: 0,
            total_value: 0,
            total_pnl: 0,
            avg_vigl_score: 0
          },
          insights: [],
          recommendations: []
        };
      }
      
      // Update positions in database
      await this.updatePositions(positions);
      
      // Get VIGL scores for all position symbols
      const symbols = positions.map(p => p.symbol);
      const viglScores = await this.getViglScores(symbols);
      
      // Analyze each position
      const analyzedPositions = [];
      const insights = [];
      const recommendations = [];
      
      for (const position of positions) {
        const analysis = await this.analyzePosition(position, viglScores[position.symbol]);
        analyzedPositions.push(analysis);
        
        if (analysis.insights) {
          insights.push(...analysis.insights);
        }
        
        if (analysis.recommendation) {
          recommendations.push(analysis.recommendation);
        }
        
        // Store analysis in database
        await this.storePositionAnalysis(analysis);
      }
      
      // Calculate summary statistics
      const summary = this.calculatePortfolioSummary(analyzedPositions);
      
      console.log('✅ Portfolio intelligence analysis complete');
      
      return {
        success: true,
        positions: analyzedPositions,
        summary,
        insights,
        recommendations,
        analyzed_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Portfolio analysis error:', error.message);
      throw error;
    }
  }
  
  // Analyze individual position
  async analyzePosition(position, viglData = null) {
    const symbol = position.symbol;
    const unrealizedPnlPct = parseFloat(position.unrealized_plpc) * 100;
    const marketValue = parseFloat(position.market_value);
    const unrealizedPnl = parseFloat(position.unrealized_pl);
    
    const analysis = {
      symbol,
      quantity: parseFloat(position.qty),
      avg_cost: parseFloat(position.avg_cost),
      current_price: parseFloat(position.current_price),
      market_value: marketValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_pct: unrealizedPnlPct,
      side: position.side,
      
      // VIGL intelligence
      vigl_score: viglData?.vigl_score || null,
      discovery_confidence: viglData?.confidence || null,
      volume_factor: viglData?.volume_factor || null,
      last_vigl_action: viglData?.action || null,
      
      // Intelligence insights
      insights: [],
      recommendation: null,
      risk_assessment: 'unknown',
      confidence_level: 'low'
    };
    
    // Performance analysis
    if (viglData) {
      analysis.confidence_level = this.getConfidenceLevel(viglData.vigl_score, viglData.confidence);
      analysis.pattern_strength = this.assessPatternStrength(viglData);
      
      // Entry accuracy analysis
      if (viglData.price) {
        analysis.entry_accuracy = this.calculateEntryAccuracy(
          parseFloat(position.avg_cost),
          viglData.price,
          parseFloat(position.current_price)
        );
      }
    }
    
    // Generate insights
    analysis.insights = this.generateInsights(analysis, viglData);
    
    // Generate recommendation
    analysis.recommendation = this.generateRecommendation(analysis, viglData);
    
    // Risk assessment
    analysis.risk_assessment = this.assessRisk(analysis, viglData);
    
    return analysis;
  }
  
  // Generate actionable insights
  generateInsights(analysis, viglData) {
    const insights = [];
    
    // P&L insights
    if (analysis.unrealized_pnl_pct > 20) {
      insights.push({
        type: 'profit_taking',
        message: `Strong gain of ${analysis.unrealized_pnl_pct.toFixed(1)}% - consider taking profits`,
        priority: 2
      });
    } else if (analysis.unrealized_pnl_pct < -15) {
      insights.push({
        type: 'loss_management',
        message: `Significant loss of ${Math.abs(analysis.unrealized_pnl_pct).toFixed(1)}% - review stop loss`,
        priority: 1
      });
    }
    
    // VIGL score insights
    if (viglData) {
      if (viglData.vigl_score > 3.5) {
        insights.push({
          type: 'strong_pattern',
          message: `High VIGL score of ${viglData.vigl_score.toFixed(1)} indicates strong momentum`,
          priority: 2
        });
      } else if (viglData.vigl_score < 1.5) {
        insights.push({
          type: 'weak_pattern',
          message: `Low VIGL score of ${viglData.vigl_score.toFixed(1)} suggests weakening pattern`,
          priority: 2
        });
      }
      
      if (viglData.volume_factor > 10) {
        insights.push({
          type: 'volume_spike',
          message: `Exceptional volume at ${viglData.volume_factor.toFixed(1)}x average`,
          priority: 2
        });
      }
    }
    
    // Entry accuracy insights
    if (analysis.entry_accuracy) {
      if (analysis.entry_accuracy > 0.8) {
        insights.push({
          type: 'excellent_entry',
          message: `Entry timing was excellent (${(analysis.entry_accuracy * 100).toFixed(0)}% accuracy)`,
          priority: 3
        });
      } else if (analysis.entry_accuracy < 0.3) {
        insights.push({
          type: 'poor_entry',
          message: `Entry timing could be improved (${(analysis.entry_accuracy * 100).toFixed(0)}% accuracy)`,
          priority: 2
        });
      }
    }
    
    return insights;
  }
  
  // Generate actionable recommendation
  generateRecommendation(analysis, viglData) {
    const pnlPct = analysis.unrealized_pnl_pct;
    const viglScore = viglData?.vigl_score || 0;
    const confidence = viglData?.confidence || 0;
    
    if (pnlPct > 25 && viglScore < 2.0) {
      return {
        action: 'TAKE_PROFITS',
        confidence: 'high',
        reasoning: 'Strong gains with weakening VIGL pattern',
        target_pct: 50,
        urgency: 'medium'
      };
    } else if (pnlPct < -20 && viglScore < 1.5) {
      return {
        action: 'CONSIDER_EXIT',
        confidence: 'high',
        reasoning: 'Significant losses with poor VIGL outlook',
        target_pct: 100,
        urgency: 'high'
      };
    } else if (viglScore > 3.5 && confidence > 0.8) {
      return {
        action: 'HOLD_STRONG',
        confidence: 'high',
        reasoning: 'Excellent VIGL pattern with high confidence',
        target_pct: 0,
        urgency: 'low'
      };
    } else if (pnlPct > 10 && viglScore > 2.5) {
      return {
        action: 'PARTIAL_PROFIT',
        confidence: 'medium',
        reasoning: 'Good gains with solid VIGL support',
        target_pct: 25,
        urgency: 'low'
      };
    } else {
      return {
        action: 'MONITOR',
        confidence: 'medium',
        reasoning: 'Position within normal parameters',
        target_pct: 0,
        urgency: 'low'
      };
    }
  }
  
  // Assess risk level
  assessRisk(analysis, viglData) {
    const pnlPct = Math.abs(analysis.unrealized_pnl_pct);
    const viglScore = viglData?.vigl_score || 0;
    
    if (pnlPct > 30 || viglScore < 1.0) return 'high';
    if (pnlPct > 15 || viglScore < 2.0) return 'medium';
    if (viglScore > 3.0) return 'low';
    return 'medium';
  }
  
  // Helper methods
  getConfidenceLevel(score, confidence) {
    if (score > 3.5 && confidence > 0.8) return 'very_high';
    if (score > 2.5 && confidence > 0.6) return 'high';
    if (score > 1.5 && confidence > 0.4) return 'medium';
    return 'low';
  }
  
  assessPatternStrength(viglData) {
    return (viglData.vigl_score * 0.7) + (viglData.confidence * 0.3);
  }
  
  calculateEntryAccuracy(avgCost, viglPrice, currentPrice) {
    if (!viglPrice) return null;
    
    const optimalRange = viglPrice * 0.05; // 5% range around VIGL price
    const entryDistance = Math.abs(avgCost - viglPrice);
    
    if (entryDistance <= optimalRange) {
      return 1.0 - (entryDistance / optimalRange) * 0.3;
    } else {
      return Math.max(0, 0.7 - (entryDistance - optimalRange) / viglPrice);
    }
  }
  
  calculatePortfolioSummary(positions) {
    const totalValue = positions.reduce((sum, p) => sum + p.market_value, 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
    const avgViglScore = positions
      .filter(p => p.vigl_score)
      .reduce((sum, p, _, arr) => sum + p.vigl_score / arr.length, 0);
    
    const riskDistribution = positions.reduce((acc, p) => {
      acc[p.risk_assessment] = (acc[p.risk_assessment] || 0) + 1;
      return acc;
    }, {});
    
    return {
      total_positions: positions.length,
      total_value: totalValue,
      total_pnl: totalPnl,
      total_pnl_pct: totalValue > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0,
      avg_vigl_score: avgViglScore,
      risk_distribution: riskDistribution,
      positions_with_vigl: positions.filter(p => p.vigl_score).length
    };
  }
  
  // Database operations
  async updatePositions(positions) {
    if (!this.isEnabled) return;
    
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO portfolio_positions (
          symbol, quantity, avg_cost, current_price, market_value,
          unrealized_pnl, unrealized_pnl_pct, side
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      positions.forEach(position => {
        stmt.run(
          position.symbol,
          parseFloat(position.qty),
          parseFloat(position.avg_cost),
          parseFloat(position.current_price),
          parseFloat(position.market_value),
          parseFloat(position.unrealized_pl),
          parseFloat(position.unrealized_plpc) * 100,
          position.side
        );
      });
      
      console.log(`📊 Updated ${positions.length} positions in database`);
    } catch (error) {
      console.error('❌ Error updating positions:', error.message);
    }
  }
  
  async storePositionAnalysis(analysis) {
    if (!this.isEnabled) return;
    
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO portfolio_intelligence (
          symbol, analysis_date, position_quantity, position_value, unrealized_pnl,
          unrealized_pnl_pct, current_vigl_score, discovery_confidence, 
          pattern_strength, volume_analysis, recommendation, confidence_level,
          risk_assessment, suggested_action, entry_accuracy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        analysis.symbol,
        new Date().toISOString().split('T')[0],
        analysis.quantity,
        analysis.market_value,
        analysis.unrealized_pnl,
        analysis.unrealized_pnl_pct,
        analysis.vigl_score,
        analysis.discovery_confidence,
        analysis.pattern_strength,
        analysis.volume_factor,
        JSON.stringify(analysis.recommendation),
        analysis.confidence_level,
        analysis.risk_assessment,
        analysis.recommendation?.action,
        analysis.entry_accuracy
      );
    } catch (error) {
      console.error('❌ Error storing position analysis:', error.message);
    }
  }
  
  // Get historical portfolio analysis
  getPortfolioHistory(days = 30) {
    if (!this.isEnabled) return [];
    
    try {
      const query = `
        SELECT * FROM portfolio_intelligence
        WHERE analysis_date >= date('now', '-${days} days')
        ORDER BY analysis_date DESC, symbol
      `;
      
      return this.db.prepare(query).all();
    } catch (error) {
      console.error('❌ Error getting portfolio history:', error.message);
      return [];
    }
  }
  
  // Get portfolio insights summary
  getInsightsSummary() {
    if (!this.isEnabled) return null;
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_positions,
          AVG(current_vigl_score) as avg_vigl_score,
          AVG(unrealized_pnl_pct) as avg_pnl_pct,
          COUNT(CASE WHEN risk_assessment = 'high' THEN 1 END) as high_risk_count,
          COUNT(CASE WHEN suggested_action = 'TAKE_PROFITS' THEN 1 END) as profit_take_signals,
          COUNT(CASE WHEN suggested_action = 'CONSIDER_EXIT' THEN 1 END) as exit_signals
        FROM portfolio_intelligence
        WHERE analysis_date = date('now')
      `;
      
      return this.db.prepare(query).get();
    } catch (error) {
      console.error('❌ Error getting insights summary:', error.message);
      return null;
    }
  }
}

module.exports = PortfolioIntelligence;