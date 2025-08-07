#!/usr/bin/env node
/**
 * Trading Intelligence Dashboard - Complete Backend
 * Unified VIGL Discovery + Portfolio Management in single deployment
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const PortfolioIntelligence = require('./portfolio_intelligence');
const { saveSimpleBackup } = require('./utils/simple_data_backup');
// const MarketIntelligence = require('./market_intelligence'); // TODO: Enable when ready
const PositionThesis = require('./utils/position_thesis');
const PortfolioHealth = require('./utils/portfolio_health');
const DataValidation = require('./utils/data_validation');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const ALPACA_CONFIG = {
  apiKey: process.env.APCA_API_KEY_ID || '',
  secretKey: process.env.APCA_API_SECRET_KEY || '',
  baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets'
};

// Debug logging
console.log('🔐 Alpaca Config:', {
  hasApiKey: !!ALPACA_CONFIG.apiKey,
  hasSecretKey: !!ALPACA_CONFIG.secretKey,
  baseUrl: ALPACA_CONFIG.baseUrl,
  apiKeyLength: ALPACA_CONFIG.apiKey.length,
  secretKeyLength: ALPACA_CONFIG.secretKey.length
});

// Global state
let dashboardData = {
  portfolio: { positions: [], totalValue: 0, dailyPnL: 0 },
  discoveries: [],
  alerts: [],
  lastUpdated: new Date().toISOString(),
  isConnected: false
};

// Initialize Market Intelligence (disabled for now)
// const marketIntelligence = new MarketIntelligence({
//   redditClientId: process.env.REDDIT_CLIENT_ID,
//   redditClientSecret: process.env.REDDIT_CLIENT_SECRET,
//   youtubeApiKey: process.env.YOUTUBE_API_KEY
// });

// =============================================================================
// ALPACA API INTEGRATION
// =============================================================================

function makeAlpacaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    if (!ALPACA_CONFIG.apiKey) {
      console.log('❌ No API key configured');
      resolve(null); // Return null for mock data fallback
      return;
    }

    const url = new URL(ALPACA_CONFIG.baseUrl);
    const options = {
      hostname: url.hostname,
      path: `/v2/${endpoint}`,
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': ALPACA_CONFIG.apiKey,
        'APCA-API-SECRET-KEY': ALPACA_CONFIG.secretKey
      }
    };

    console.log(`📡 Requesting: https://${url.hostname}/v2/${endpoint}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            console.error(`❌ Alpaca API error: ${res.statusCode} - ${data}`);
            console.error('🔑 Check if your API keys are correct and active');
            resolve(null);
          } else {
            console.log(`✅ Alpaca API success: ${endpoint}`);
            resolve(parsed);
          }
        } catch (e) {
          console.error('❌ Failed to parse Alpaca response:', e.message, 'Raw data:', data.substring(0, 200));
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Alpaca request failed:', err.message);
      resolve(null);
    });
    req.setTimeout(10000, () => {
      console.error('❌ Alpaca request timeout');
      resolve(null);
    });
    req.end();
  });
}

async function fetchAlpacaPositions() {
  try {
    console.log('🔍 Fetching Alpaca positions...');
    const positions = await makeAlpacaRequest('positions');
    const account = await makeAlpacaRequest('account');
    
    if (!positions || !account) {
      console.log('⚠️ No Alpaca data received - API connection failed');
      return generateEmptyPortfolio();
    }
    
    console.log(`✅ Found ${positions.length} real positions from Alpaca`);
    
    // Debug: Log the first position to see what data we're getting
    if (positions.length > 0) {
      console.log('📊 Sample position data:', {
        symbol: positions[0].symbol,
        qty: positions[0].qty,
        current_price: positions[0].current_price,
        avg_entry_price: positions[0].avg_entry_price,
        market_value: positions[0].market_value,
        unrealized_pl: positions[0].unrealized_pl,
        unrealized_plpc: positions[0].unrealized_plpc,
        change_today: positions[0].change_today,
        percent_change_today: positions[0].percent_change_today
      });
    }
    
    // Validate and clean position data
    const enhancedPositions = positions.map(pos => DataValidation.validatePosition(pos));
    
    // Validate portfolio summary
    const portfolioSummary = DataValidation.validatePortfolioSummary(enhancedPositions, account);
    
    // Generate data quality report
    const qualityReport = DataValidation.generateQualityReport(enhancedPositions, portfolioSummary);
    
    console.log(`📊 Portfolio data quality: ${qualityReport.quality} (${qualityReport.completeness.toFixed(0)}% complete)`);
    if (qualityReport.warnings.length > 0) {
      console.log('⚠️ Data warnings:', qualityReport.warnings);
    }
    if (qualityReport.issues.length > 0) {
      console.log('❌ Data issues:', qualityReport.issues);
    }
    
    return {
      positions: enhancedPositions,
      ...portfolioSummary,
      isConnected: true,
      dataQuality: qualityReport
    };
  } catch (error) {
    console.log('❌ Alpaca connection failed:', error.message);
    return generateEmptyPortfolio();
  }
}

function generateEmptyPortfolio() {
  console.log('❌ No Alpaca connection - returning empty portfolio');
  console.log('🔑 Add your Alpaca API keys to see real positions');
  
  return {
    positions: [],
    totalValue: 0,
    dailyPnL: 0,
    isConnected: false,
    error: 'Alpaca API keys not configured or invalid'
  };
}

// =============================================================================
// WOLF RISK ANALYSIS
// =============================================================================

function analyzePositionRisk(position) {
  const { unrealizedPnLPercent, currentPrice, avgEntryPrice, symbol } = position;
  
  // WOLF Risk Calculation (prevents -25% losses) - CONSISTENT scoring
  let wolfScore = 0.3; // Base risk
  
  // Price decline risk
  if (unrealizedPnLPercent < -20) wolfScore += 0.4;
  else if (unrealizedPnLPercent < -15) wolfScore += 0.3;
  else if (unrealizedPnLPercent < -10) wolfScore += 0.2;
  
  // Volatility factor (deterministic based on symbol for consistency)
  const symbolHash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const volatility = (symbolHash % 10) / 100; // 0-0.09 range
  wolfScore += volatility;
  
  // Position size factor (larger positions = higher risk)
  const positionWeight = position.marketValue / 25000; // Assume 25k portfolio
  wolfScore += Math.min(positionWeight * 0.1, 0.2);
  
  wolfScore = Math.min(wolfScore, 1.0);
  
  // Generate recommendation
  let recommendation = 'HOLD';
  let action = 'Monitor position';
  
  if (wolfScore >= 0.8) {
    recommendation = 'SELL';
    action = 'High risk - consider exit';
  } else if (wolfScore >= 0.6) {
    recommendation = 'REDUCE';
    action = 'Moderate risk - reduce exposure';
  } else if (wolfScore <= 0.3 && unrealizedPnLPercent > 5) {
    recommendation = 'BUY_MORE';
    action = 'Low risk + profit - consider adding';
  }
  
  return {
    wolfScore: Math.round(wolfScore * 100) / 100,
    riskLevel: wolfScore >= 0.6 ? 'HIGH' : wolfScore >= 0.4 ? 'MODERATE' : 'LOW',
    recommendation,
    action,
    riskFactors: [
      unrealizedPnLPercent < -15 ? 'Large drawdown' : null,
      volatility > 2 ? 'High volatility' : null,
      positionWeight > 0.2 ? 'Large position' : null
    ].filter(Boolean)
  };
}

// =============================================================================
// VIGL PATTERN DISCOVERY
// =============================================================================

function calculateViglSimilarity(stock) {
  // VIGL Reference Pattern (324% winner)
  const viglPattern = {
    volumeSpike: 20.9, // 20.9x average volume
    priceRange: { low: 2.94, high: 4.66 },
    momentum: 324, // 324% gain over run
    marketCap: 50e6 // ~$50M market cap
  };
  
  let similarity = 0;
  let confidence = 0;
  
  // Volume similarity (40% weight)
  const volumeScore = Math.min(stock.volumeSpike / viglPattern.volumeSpike, 1.0) * 0.4;
  similarity += volumeScore;
  
  // Price momentum similarity (30% weight)
  const momentumScore = Math.min(Math.abs(stock.momentum) / 50, 1.0) * 0.3; // Scale to reasonable range
  similarity += momentumScore;
  
  // Market cap similarity (20% weight) - prefer smaller caps
  const capScore = stock.marketCap < 500e6 ? 0.2 : stock.marketCap < 1e9 ? 0.15 : 0.1;
  similarity += capScore;
  
  // Technical pattern similarity (10% weight)
  const technicalScore = (stock.breakoutStrength || 0.5) * 0.1;
  similarity += technicalScore;
  
  // Confidence calculation
  confidence = Math.min(similarity * 1.2, 1.0);
  
  return {
    similarity: Math.round(similarity * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    isHighConfidence: confidence >= 0.8,
    estimatedUpside: confidence >= 0.8 ? '200-400%' : confidence >= 0.6 ? '100-200%' : '50-100%'
  };
}

// Simple cache to store VIGL discoveries
let viglDiscoveryCache = [];
let lastViglScan = null;
let viglScanInProgress = false;

// Fetch VIGL discoveries from real-time API service
async function scanForViglPatterns() {
  console.log('🔍 Fetching real-time VIGL discoveries from API...');
  
  // Prevent multiple simultaneous scans
  if (viglScanInProgress) {
    console.log('⏳ VIGL scan already in progress - please wait...');
    throw new Error('VIGL scan already in progress. Please wait for current scan to complete (1-2 minutes).');
  }
  
  // Check cache first (2 minute refresh for active trading)
  if (lastViglScan && (Date.now() - lastViglScan) < 120000 && viglDiscoveryCache.length > 0) {
    console.log(`✅ Using cached VIGL discoveries: ${viglDiscoveryCache.length} patterns (${Math.round((Date.now() - lastViglScan) / 1000)}s ago)`);
    return viglDiscoveryCache;
  }

  // Set scan in progress flag
  viglScanInProgress = true;
  console.log('📁 Loading fresh VIGL discoveries from live data file...');

  try {
    // Fetch from real-time VIGL API service
    const viglApiUrl = process.env.VIGL_API_URL || 'https://vigl-api-service.onrender.com';
    const https = require('https');
    
    let discoveries = [];
    
    try {
      // Fetch from VIGL API
      const apiResponse = await new Promise((resolve, reject) => {
        const req = https.get(`${viglApiUrl}/vigl/latest`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON response from VIGL API'));
            }
          });
        });
        
        req.on('error', reject);
        req.setTimeout(10000, () => reject(new Error('VIGL API timeout')));
      });
      
      if (apiResponse.success && apiResponse.data) {
        discoveries = apiResponse.data.map(d => ({
          symbol: d.symbol,
          name: d.company_name,
          currentPrice: d.current_price,
          marketCap: d.market_cap,
          volumeSpike: d.volume_spike_ratio,
          momentum: d.momentum,
          breakoutStrength: d.pattern_strength,
          sector: d.sector,
          catalysts: d.catalysts,
          similarity: d.vigl_similarity,
          confidence: d.confidence_score,
          isHighConfidence: d.is_high_confidence,
          estimatedUpside: d.estimated_upside,
          discoveredAt: d.discovered_at,
          riskLevel: d.risk_level,
          recommendation: d.recommendation
        }));
        
        console.log(`✅ Fetched ${discoveries.length} real-time VIGL patterns from API`);
        console.log(`📊 Last scan: ${apiResponse.scan_time || 'Unknown'}`);
      } else {
        throw new Error('Invalid API response format');
      }
      
    } catch (apiError) {
      console.error('❌ VIGL API fetch failed:', apiError.message);
      
      // If API fails, show error instead of fake data
      throw new Error(`VIGL API service unavailable: ${apiError.message}`);
    }
    
    // Enhance discoveries with proper target prices
    discoveries = discoveries.map(stock => {
      const currentPrice = stock.currentPrice;
      
      // Parse the estimated upside range (e.g., "200-400%" -> [200, 400])
      let minUpside = 100, maxUpside = 200; // defaults
      if (stock.estimatedUpside) {
        const match = stock.estimatedUpside.match(/(\d+)-(\d+)%/);
        if (match) {
          minUpside = parseInt(match[1]);
          maxUpside = parseInt(match[2]);
        }
      }
      
      // Calculate target prices based on upside
      const conservativeTarget = currentPrice * (1 + minUpside / 100);
      const aggressiveTarget = currentPrice * (1 + maxUpside / 100);
      const moderateTarget = (conservativeTarget + aggressiveTarget) / 2;
      
      return {
        ...stock,
        targetPrices: {
          conservative: conservativeTarget,
          moderate: moderateTarget,
          aggressive: aggressiveTarget
        },
        calculatedUpside: {
          min: minUpside,
          max: maxUpside,
          average: (minUpside + maxUpside) / 2
        }
      };
    });
    
    console.log(`✅ Loaded ${discoveries.length} real VIGL patterns from your Python system`);
    
    // Cache the results
    viglDiscoveryCache = discoveries;
    lastViglScan = Date.now();
    
    console.log('🎯 VIGL patterns loaded:', discoveries.map(d => 
      `${d.symbol} (${Math.round(d.confidence * 100)}% match, ${d.volumeSpike}x volume)`
    ).join(', '));
    
    return discoveries;
    
  } catch (error) {
    console.error('❌ VIGL discovery error:', error.message);
    throw error; // Re-throw so UI can handle the error
  } finally {
    // Always clear the in-progress flag
    viglScanInProgress = false;
    console.log('✅ VIGL scan completed - ready for next scan');
  }
}

// =============================================================================
// ALERT SYSTEM
// =============================================================================

async function generateAlerts(portfolio, discoveries) {
  const alerts = [];
  
  // Get portfolio intelligence alerts (enhanced real-time alerts)
  try {
    const portfolioIntelligence = new PortfolioIntelligence();
    const intelligenceAlerts = await portfolioIntelligence.generatePortfolioAlerts();
    alerts.push(...intelligenceAlerts);
  } catch (error) {
    console.log('Portfolio intelligence error:', error.message);
  }
  
  // Keep existing VIGL discovery alerts
  discoveries.forEach(discovery => {
    if (discovery.confidence >= 0.8) {
      alerts.push({
        id: `discovery-${discovery.symbol}`,
        type: 'OPPORTUNITY',
        severity: 'HIGH',
        title: `VIGL Pattern: ${discovery.symbol}`,
        message: `${(discovery.confidence * 100).toFixed(0)}% similarity - ${discovery.estimatedUpside} potential`,
        symbol: discovery.symbol,
        timestamp: new Date().toISOString(),
        action: discovery.recommendation
      });
    }
  });
  
  // Sort by severity and timestamp, limit to top 5 alerts
  const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
  return alerts
    .sort((a, b) => {
      const severityDiff = (severityOrder[b.severity] || 1) - (severityOrder[a.severity] || 1);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    })
    .slice(0, 5);
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Debug endpoint to see raw Alpaca data
app.get('/api/debug/alpaca', async (req, res) => {
  try {
    const positions = await makeAlpacaRequest('positions');
    const account = await makeAlpacaRequest('account');
    
    res.json({
      positions: positions || [],
      account: account || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const portfolio = await fetchAlpacaPositions();
    
    // Add risk analysis and thesis to each position
    portfolio.positions = portfolio.positions.map(position => {
      const riskAnalysis = analyzePositionRisk(position);
      const thesis = PositionThesis.generateThesis(position);
      
      return {
        ...position,
        riskAnalysis,
        thesis
      };
    });
    
    const discoveries = await scanForViglPatterns();
    const alerts = await generateAlerts(portfolio, discoveries);
    
    // Generate comprehensive portfolio health analysis
    const healthAnalysis = PortfolioHealth.analyzePortfolioHealth(portfolio, discoveries);
    
    dashboardData = {
      portfolio: {
        ...portfolio,
        // Add total P&L tracking
        totalPnL: portfolio.totalPnL || 0,
        totalPnLPercent: portfolio.totalPnLPercent || 0
      },
      discoveries,
      alerts,
      health: healthAnalysis,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalValue: portfolio.totalValue,
        dailyPnL: portfolio.dailyPnL,
        totalPnL: portfolio.totalPnL || 0,
        viglScore: discoveries.length > 0 ? Math.max(...discoveries.map(d => d.confidence)) : 0,
        avgWolfRisk: portfolio.positions.length > 0 
          ? portfolio.positions.reduce((sum, p) => sum + p.riskAnalysis.wolfScore, 0) / portfolio.positions.length
          : 0,
        highRiskPositions: portfolio.positions.filter(p => p.riskAnalysis.wolfScore >= 0.6).length,
        viglOpportunities: discoveries.filter(d => d.confidence >= 0.6).length
      }
    };
    
    // Simple backup (non-critical, won't affect functionality)
    saveSimpleBackup(dashboardData);
    
    res.json(dashboardData);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Check VIGL scan status
app.get('/api/vigl-status', (req, res) => {
  res.json({
    scanning: viglScanInProgress,
    lastScan: lastViglScan,
    cacheCount: viglDiscoveryCache.length,
    message: viglScanInProgress ? 
      'VIGL pattern analysis in progress... Please wait 1-2 minutes.' : 
      'VIGL scanner ready'
  });
});

// Run analysis
app.post('/api/analyze', async (req, res) => {
  try {
    const { type = 'both' } = req.body;
    
    let result = {};
    
    if (type === 'portfolio' || type === 'both') {
      const portfolio = await fetchAlpacaPositions();
      portfolio.positions = portfolio.positions.map(position => ({
        ...position,
        riskAnalysis: analyzePositionRisk(position)
      }));
      result.portfolio = portfolio;
    }
    
    if (type === 'vigl' || type === 'both') {
      result.discoveries = await scanForViglPatterns();
    }
    
    result.timestamp = new Date().toISOString();
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Market Intelligence endpoints (disabled for now)
// app.get('/api/market-intelligence', (req, res) => {
//   res.json({ 
//     discoveries: [], 
//     confluences: [], 
//     isMonitoring: false,
//     message: 'Market intelligence coming soon'
//   });
// });

// Trading actions
app.post('/api/trade', async (req, res) => {
  try {
    const { action, symbol, qty } = req.body;
    
    if (!ALPACA_CONFIG.apiKey) {
      return res.status(400).json({ error: 'Alpaca API not configured' });
    }
    
    const orderData = {
      symbol: symbol.toString(),
      qty: qty.toString(),
      side: action, // 'buy' or 'sell'
      type: 'market',
      time_in_force: 'day'
    };
    
    console.log(`🔄 Placing ${action} order: ${qty} shares of ${symbol}`);
    
    const result = await makeAlpacaTradeRequest('orders', 'POST', orderData);
    
    if (result) {
      console.log(`✅ Order placed successfully: ${result.id}`);
      res.json({ 
        success: true, 
        orderId: result.id,
        message: `${action.toUpperCase()} order placed: ${qty} shares of ${symbol}`
      });
    } else {
      res.status(500).json({ error: 'Failed to place order' });
    }
    
  } catch (error) {
    console.error('❌ Trading error:', error);
    res.status(500).json({ error: 'Trading operation failed' });
  }
});

// Helper function for trading requests
function makeAlpacaTradeRequest(endpoint, method, data) {
  return new Promise((resolve, reject) => {
    if (!ALPACA_CONFIG.apiKey) {
      console.log('❌ No API key configured for trading');
      resolve(null);
      return;
    }

    const url = new URL(ALPACA_CONFIG.baseUrl);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      path: `/v2/${endpoint}`,
      method: method,
      headers: {
        'APCA-API-KEY-ID': ALPACA_CONFIG.apiKey,
        'APCA-API-SECRET-KEY': ALPACA_CONFIG.secretKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`📡 Trading request: ${method} https://${url.hostname}/v2/${endpoint}`);

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            console.error(`❌ Alpaca trading error: ${res.statusCode} - ${responseData}`);
            resolve(null);
          }
        } catch (e) {
          console.error('❌ Failed to parse trading response:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Trading request failed:', err.message);
      resolve(null);
    });
    
    req.setTimeout(10000, () => {
      console.error('❌ Trading request timeout');
      resolve(null);
    });
    
    req.write(postData);
    req.end();
  });
}

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Trading Intelligence Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/dashboard`);
  console.log(`🔑 Alpaca Connected: ${!!ALPACA_CONFIG.apiKey}`);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});