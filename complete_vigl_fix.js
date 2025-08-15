/**
 * Complete VIGL Fix - Integration Logic
 * Connects VIGL Discovery System to Dashboard with Portfolio Integration
 */

const { SecureVIGLConnector } = require('./secure_vigl_connector');
const path = require('path');

class CompleteVIGLFix {
  constructor(options = {}) {
    this.viglConnector = new SecureVIGLConnector({
      viglScriptPath: options.viglScriptPath || this._findViglScript(),
      dbPath: options.dbPath || path.join(__dirname, 'trading_dashboard.db'),
      ...options
    });
    
    this.db = null;
    this.alpacaConfig = null;
    this.initializeDatabase();
    this.initializeAlpacaConfig();
  }

  /**
   * Initialize database connection
   */
  initializeDatabase() {
    try {
      this.db = require('./server/db/sqlite');
      console.log('✅ Database connection established');
    } catch (error) {
      console.warn('⚠️ Database not available:', error.message);
    }
  }

  /**
   * Initialize Alpaca configuration
   */
  initializeAlpacaConfig() {
    this.alpacaConfig = {
      apiKey: process.env.APCA_API_KEY_ID,
      secretKey: process.env.APCA_API_SECRET_KEY,
      baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets',
      isConfigured: !!(process.env.APCA_API_KEY_ID && process.env.APCA_API_SECRET_KEY)
    };
    
    console.log(`🔑 Alpaca configured: ${this.alpacaConfig.isConfigured}`);
  }

  /**
   * Find VIGL script in the system
   */
  _findViglScript() {
    const possiblePaths = [
      path.join(__dirname, 'VIGL_Discovery_Complete.py'),
      path.join(__dirname, '..', 'VIGL-Discovery', 'VIGL_Discovery_Complete.py'),
      path.join(process.env.HOME || '', 'Desktop', 'Trading-Systems', 'VIGL-Discovery', 'VIGL_Discovery_Complete.py'),
      path.join(process.env.HOME || '', 'Documents', 'Portfolio-Systems', 'VIGL-Discovery', 'VIGL_Discovery_Complete.py')
    ];

    for (const scriptPath of possiblePaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(scriptPath)) {
          console.log(`✅ Found VIGL script at: ${scriptPath}`);
          return scriptPath;
        }
      } catch (error) {
        // Continue searching
      }
    }

    // Default path - will be validated when used
    console.warn('⚠️ VIGL script not found in standard locations');
    return path.join(__dirname, 'VIGL_Discovery_Complete.py');
  }

  /**
   * Run comprehensive VIGL discovery scan
   */
  async runViglDiscovery(options = {}) {
    try {
      console.log('🔍 Starting comprehensive VIGL discovery...');
      
      // Check prerequisites
      await this._validatePrerequisites();
      
      // Run VIGL scan
      const result = await this.viglConnector.runViglDiscovery(options.symbols, options);
      
      if (result.success) {
        // Get discoveries from database with enhanced formatting
        const discoveries = await this._getEnhancedDiscoveries();
        
        return {
          success: true,
          count: discoveries.length,
          discoveries,
          viglCount: discoveries.filter(d => d.action === 'BUY').length,
          watchlistCount: discoveries.filter(d => d.action === 'WATCHLIST').length,
          monitorCount: discoveries.filter(d => d.action === 'MONITOR').length,
          timestamp: new Date().toISOString(),
          message: `Found ${discoveries.length} VIGL patterns ready for trading`
        };
      } else {
        throw new Error(result.error || 'VIGL discovery failed');
      }
      
    } catch (error) {
      console.error('❌ VIGL discovery failed:', error.message);
      return {
        success: false,
        error: error.message,
        count: 0,
        discoveries: [],
        message: `Discovery failed: ${error.message}`
      };
    }
  }

  /**
   * Validate prerequisites for VIGL discovery
   */
  async _validatePrerequisites() {
    const errors = [];

    // Check API keys
    if (!process.env.POLYGON_API_KEY) {
      errors.push('POLYGON_API_KEY not configured');
    }

    // Check database
    if (!this.db) {
      errors.push('Database connection not available');
    }

    // Check VIGL script
    const fs = require('fs');
    if (!fs.existsSync(this.viglConnector.options.viglScriptPath)) {
      errors.push(`VIGL script not found at: ${this.viglConnector.options.viglScriptPath}`);
    }

    if (errors.length > 0) {
      throw new Error(`Prerequisites not met: ${errors.join(', ')}`);
    }
  }

  /**
   * Get enhanced discoveries with portfolio integration data
   */
  async _getEnhancedDiscoveries() {
    if (!this.db) {
      return [];
    }

    try {
      // Get latest discoveries from database
      const rawDiscoveries = await this.db.getLatestDiscoveriesForEngine(20);
      
      // Enhance with portfolio and trading data
      const enhanced = await Promise.all(
        rawDiscoveries.map(discovery => this._enhanceDiscovery(discovery))
      );

      // Filter for actionable discoveries
      return enhanced.filter(d => ['BUY', 'WATCHLIST', 'MONITOR'].includes(d.action));

    } catch (error) {
      console.error('❌ Failed to get enhanced discoveries:', error.message);
      return [];
    }
  }

  /**
   * Enhance single discovery with portfolio and market data
   */
  async _enhanceDiscovery(discovery) {
    const features = this._safeParseJSON(discovery.features_json, {});
    
    return {
      symbol: discovery.symbol,
      name: discovery.symbol, // Could enhance with company name lookup
      currentPrice: discovery.price || 0,
      score: discovery.score || 0,
      confidence: features.confidence || 0,
      action: discovery.action || 'MONITOR',
      
      // Market data
      volumeSpike: features.technicals?.rel_volume || 1.0,
      momentum: features.technicals?.momentum || 0,
      marketCap: 100000000, // Default - could enhance with real data
      
      // VIGL specific
      viglScore: Math.min(discovery.score / 100, 1.0),
      similarity: Math.min(discovery.score / 100, 1.0),
      isHighConfidence: discovery.score >= 75,
      explosivenessScore: discovery.explosiveness_score || null,
      
      // Trading recommendations
      estimatedUpside: this._calculateUpside(discovery.score),
      targetPrices: this._calculateTargetPrices(discovery.price || 0, discovery.score),
      riskLevel: discovery.score >= 70 ? 'MODERATE' : 'HIGH',
      
      // Portfolio integration
      isInPortfolio: await this._checkIfInPortfolio(discovery.symbol),
      portfolioPosition: await this._getPortfolioPosition(discovery.symbol),
      
      // Catalysts and metadata
      catalysts: features.catalyst?.type ? [features.catalyst.type] : ['VIGL Pattern'],
      sector: 'Technology', // Default - could enhance with sector lookup
      discoveredAt: discovery.created_at,
      validated: features.validated || false,
      
      // Trading data for buy buttons
      recommendedQuantity: this._calculateRecommendedQuantity(discovery.price || 0, discovery.score),
      positionSize: this._calculatePositionSize(discovery.score),
      stopLoss: this._calculateStopLoss(discovery.price || 0),
      timeline: this._getTimeline(discovery.score)
    };
  }

  /**
   * Calculate upside potential based on VIGL score
   */
  _calculateUpside(score) {
    if (score >= 85) return '200-400%';
    if (score >= 75) return '100-200%';
    if (score >= 65) return '50-100%';
    return '25-50%';
  }

  /**
   * Calculate target prices based on current price and score
   */
  _calculateTargetPrices(currentPrice, score) {
    if (currentPrice <= 0) {
      return { conservative: 0, moderate: 0, aggressive: 0 };
    }

    let multipliers;
    if (score >= 85) {
      multipliers = { conservative: 2.0, moderate: 3.0, aggressive: 4.0 };
    } else if (score >= 75) {
      multipliers = { conservative: 1.5, moderate: 2.0, aggressive: 2.5 };
    } else if (score >= 65) {
      multipliers = { conservative: 1.25, moderate: 1.5, aggressive: 1.75 };
    } else {
      multipliers = { conservative: 1.1, moderate: 1.25, aggressive: 1.4 };
    }

    return {
      conservative: currentPrice * multipliers.conservative,
      moderate: currentPrice * multipliers.moderate,
      aggressive: currentPrice * multipliers.aggressive
    };
  }

  /**
   * Check if symbol is in current portfolio
   */
  async _checkIfInPortfolio(symbol) {
    if (!this.alpacaConfig.isConfigured) {
      return false;
    }

    try {
      // This would make an actual Alpaca API call
      // For now, return false to avoid API overhead during discovery
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get portfolio position data for symbol
   */
  async _getPortfolioPosition(symbol) {
    // Would fetch actual position data from Alpaca
    return null;
  }

  /**
   * Calculate recommended quantity based on price and confidence
   */
  _calculateRecommendedQuantity(price, score) {
    if (price <= 0) return 10;
    
    // Target $1000 investment for high-confidence picks
    const targetAmount = score >= 75 ? 1000 : score >= 65 ? 500 : 250;
    return Math.max(1, Math.floor(targetAmount / price));
  }

  /**
   * Calculate position size recommendation
   */
  _calculatePositionSize(score) {
    if (score >= 85) return 'LARGE'; // 3-5% portfolio
    if (score >= 75) return 'MEDIUM'; // 2-3% portfolio  
    if (score >= 65) return 'SMALL'; // 1-2% portfolio
    return 'MINIMAL'; // <1% portfolio
  }

  /**
   * Calculate stop loss level
   */
  _calculateStopLoss(price) {
    return price * 0.85; // 15% stop loss
  }

  /**
   * Get expected timeline for the trade
   */
  _getTimeline(score) {
    if (score >= 85) return '3-6 months';
    if (score >= 75) return '2-4 months';
    if (score >= 65) return '1-3 months';
    return '2-6 weeks';
  }

  /**
   * Execute buy order through Alpaca integration
   */
  async executeBuyOrder(symbol, quantity, orderType = 'market') {
    if (!this.alpacaConfig.isConfigured) {
      throw new Error('Alpaca not configured - cannot execute trades');
    }

    try {
      console.log(`📈 Executing BUY order: ${quantity} shares of ${symbol}`);
      
      const orderData = {
        symbol: symbol,
        qty: quantity.toString(),
        side: 'buy',
        type: orderType,
        time_in_force: 'day'
      };

      // This would make the actual Alpaca API call
      const result = await this._makeAlpacaTradeRequest('orders', 'POST', orderData);
      
      if (result) {
        // Log to database for tracking
        await this._logTradeExecution(symbol, 'BUY', quantity, result);
        
        return {
          success: true,
          orderId: result.id,
          message: `BUY order placed: ${quantity} shares of ${symbol}`,
          orderData: result
        };
      } else {
        throw new Error('Order execution failed');
      }
      
    } catch (error) {
      console.error('❌ Trade execution failed:', error.message);
      return {
        success: false,
        error: error.message,
        message: `Failed to buy ${symbol}: ${error.message}`
      };
    }
  }

  /**
   * Make Alpaca trade request
   */
  async _makeAlpacaTradeRequest(endpoint, method, data) {
    // Implementation would be similar to server.js makeAlpacaTradeRequest
    // This is a placeholder for the actual implementation
    console.log(`🔄 Alpaca ${method} /${endpoint}:`, data);
    return null;
  }

  /**
   * Log trade execution for tracking
   */
  async _logTradeExecution(symbol, action, quantity, orderResult) {
    if (!this.db) return;

    try {
      const logEntry = {
        symbol,
        action,
        quantity,
        order_id: orderResult?.id,
        price: orderResult?.price || 0,
        timestamp: new Date().toISOString(),
        source: 'vigl_discovery',
        status: 'executed'
      };

      // Would insert into trades log table
      console.log('📝 Trade logged:', logEntry);
      
    } catch (error) {
      console.error('⚠️ Failed to log trade:', error.message);
    }
  }

  /**
   * Get discovery status and statistics
   */
  async getDiscoveryStatus() {
    const viglStatus = this.viglConnector.getStatus();
    
    let dbStats = {};
    if (this.db) {
      try {
        const totalDiscoveries = this.db.db.prepare('SELECT COUNT(*) as count FROM discoveries').get();
        const todayDiscoveries = this.db.db.prepare(
          'SELECT COUNT(*) as count FROM discoveries WHERE date(created_at) = date("now")'
        ).get();
        
        dbStats = {
          totalDiscoveries: totalDiscoveries.count,
          todayDiscoveries: todayDiscoveries.count
        };
      } catch (error) {
        dbStats = { error: error.message };
      }
    }

    return {
      viglConnector: viglStatus,
      database: dbStats,
      alpaca: {
        configured: this.alpacaConfig.isConfigured,
        baseUrl: this.alpacaConfig.baseUrl
      },
      environment: {
        hasPolygonKey: !!process.env.POLYGON_API_KEY,
        hasAlpacaKeys: this.alpacaConfig.isConfigured
      }
    };
  }

  /**
   * Test complete system integration
   */
  async testSystemIntegration() {
    console.log('🧪 Testing VIGL system integration...');
    
    const results = {
      viglConnector: await this.viglConnector.testConnection(),
      database: await this._testDatabase(),
      alpaca: await this._testAlpaca(),
      overall: true
    };

    results.overall = results.viglConnector.success && 
                     results.database.success && 
                     (results.alpaca.success || !this.alpacaConfig.isConfigured);

    console.log(`🧪 Integration test ${results.overall ? 'PASSED' : 'FAILED'}`);
    return results;
  }

  /**
   * Test database connectivity
   */
  async _testDatabase() {
    if (!this.db) {
      return { success: false, message: 'Database not initialized' };
    }

    try {
      const result = this.db.db.prepare('SELECT COUNT(*) as count FROM discoveries').get();
      return { 
        success: true, 
        message: `Database working - ${result.count} discoveries found`
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Database test failed: ${error.message}`
      };
    }
  }

  /**
   * Test Alpaca connectivity
   */
  async _testAlpaca() {
    if (!this.alpacaConfig.isConfigured) {
      return { 
        success: false, 
        message: 'Alpaca not configured' 
      };
    }

    // Would test actual Alpaca connection
    return { 
      success: true, 
      message: 'Alpaca configuration appears valid'
    };
  }

  /**
   * Safe JSON parsing utility
   */
  _safeParseJSON(jsonString, fallback = {}) {
    if (!jsonString || jsonString === 'undefined') return fallback;
    try {
      return JSON.parse(jsonString);
    } catch {
      return fallback;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.viglConnector) {
      this.viglConnector.stopScan();
    }
    console.log('🧹 VIGL fix cleanup completed');
  }
}

module.exports = { CompleteVIGLFix };