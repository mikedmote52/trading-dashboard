#!/usr/bin/env node
/**
 * Trading Intelligence Dashboard - Complete Backend
 * Unified VIGL Discovery + Portfolio Management in single deployment
 */

// Load environment variables first
require('dotenv').config();

// Load and validate environment with comprehensive validation
const { validateAndLoadEnvironment } = require('./server/utils/environmentValidator');
console.log('🔧 Validating environment variables...');
const envValidation = validateAndLoadEnvironment({ exitOnFailure: true });

// Legacy validation function (keeping for compatibility)
function validateEnvironment() {
  const required = [
    'APCA_API_KEY_ID',
    'APCA_API_SECRET_KEY', 
    'POLYGON_API_KEY'
  ];
  
  const optional_borrow = [
    'BORROW_SHORT_PROVIDER',
    'BORROW_SHORT_API_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('🚫 Server cannot start without these environment variables');
    process.exit(1);
  }
  
  // Validate borrow provider configuration (optional)
  const borrowMissing = optional_borrow.filter(key => !process.env[key]);
  if (borrowMissing.length === 0) {
    try {
      const { validateBorrowConfig } = require('./server/services/providers/borrow');
      validateBorrowConfig();
      console.log('✅ Borrow provider configured');
    } catch (error) {
      console.warn('⚠️ Borrow provider configuration warning:', error.message);
      console.log('ℹ️ System will run without borrow/short data');
    }
  } else {
    console.log('ℹ️ Borrow provider not configured - running without short interest data');
  }
  
  console.log('✅ Environment validation passed');
}

// Run validation
validateEnvironment();

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

// mount API routes first
const discoveriesRouter = require('./server/routes/discoveries');
app.use('/api/discoveries', discoveriesRouter);
app.use('/api/portfolio', require('./server/routes/portfolio'));
app.use('/api/pm', require('./server/routes/pm'));

// Dashboard endpoint - use the same dashboard method from discoveries router
app.get('/api/dashboard', async (req, res) => {
  const db = require('./server/db/sqlite');
  
  function safeParseJSON(x, fallback) {
    if (x == null) return fallback;
    if (x === 'undefined') return fallback;
    try { return JSON.parse(x); } catch { return fallback; }
  }
  
  try {
    const rows = await db.getLatestDiscoveriesForEngine(10);
    const discoveries = rows.map(r => {
      const f = safeParseJSON(r.features_json, {});
      return {
        symbol: r.symbol,
        name: r.symbol,
        currentPrice: r.price || 0,
        marketCap: 100000000,
        volumeSpike: f.technicals?.rel_volume || 1.0,
        momentum: 0,
        breakoutStrength: Math.min(r.score / 100, 1.0),
        sector: 'Technology',
        catalysts: f.catalyst?.type ? [f.catalyst.type] : ['Pattern match'],
        similarity: Math.min(r.score / 100, 1.0),
        confidence: Math.min(r.score / 100, 1.0),
        isHighConfidence: r.score >= 75,
        estimatedUpside: r.score >= 75 ? '100-200%' : '50-100%',
        discoveredAt: r.created_at,
        riskLevel: r.score >= 70 ? 'MODERATE' : 'HIGH',
        recommendation: r.action,
        viglScore: Math.min(r.score / 100, 1.0)
      };
    }).filter(r => r.recommendation === 'BUY' || r.recommendation === 'WATCHLIST' || r.recommendation === 'MONITOR');
    
    res.json({
      success: true,
      discoveries,
      lastUpdated: new Date().toISOString(),
      summary: {
        viglOpportunities: discoveries.length,
        highConfidence: discoveries.filter(d => d.isHighConfidence).length
      }
    });
  } catch (error) {
    console.error('Dashboard endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      discoveries: [],
      summary: { viglOpportunities: 0, highConfidence: 0 }
    });
  }
});

// identity endpoint so we can verify we're on the API host  
app.get('/api/whoami', (_req, res) => res.json({ service: 'trading-dashboard-api', time: new Date().toISOString() }));

// hard JSON 404 so /api/* never falls into SPA
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API route not found', path: req.originalUrl });
});

// only serve static when explicitly enabled
if (process.env.SERVE_STATIC === 'true') {
  app.use(require('express').static('public'));
}

// Token-based authentication middleware for secure endpoints
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  const validToken = process.env.ADMIN_TOKEN || 'default-dev-token';
  
  if (!token || token !== validToken) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Valid admin token required' 
    });
  }
  
  next();
}

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
      reject(new Error('Alpaca API key not configured - cannot proceed with real data requirement'));
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
  console.log('🔍 Fetching discoveries from SQLite database...');
  
  // Check cache first (2 minute refresh for active trading)
  if (lastViglScan && (Date.now() - lastViglScan) < 120000 && viglDiscoveryCache.length > 0) {
    console.log(`✅ Using cached VIGL discoveries: ${viglDiscoveryCache.length} patterns (${Math.round((Date.now() - lastViglScan) / 1000)}s ago)`);
    return viglDiscoveryCache;
  }

  try {
    // Fetch from SQLite database
    const db = require('./server/db/sqlite');
    let discoveries = await db.getTodaysDiscoveries();
    
    console.log(`📊 Fetched ${discoveries.length} discoveries from database`);
    
    // Transform to match expected format
    discoveries = discoveries.map(d => ({
      symbol: d.symbol,
      name: d.company_name || d.symbol,
      currentPrice: d.current_price || 0,
      marketCap: d.market_cap || 0,
      volumeSpike: d.volume_spike_ratio || 0,
      momentum: d.momentum || 0,
      breakoutStrength: d.pattern_strength || 0.5,
      sector: d.sector || 'Technology',
      catalysts: JSON.parse(d.catalysts || '[]'),
      similarity: d.vigl_similarity || 0.7,
      confidence: d.confidence_score || 0.7,
      isHighConfidence: d.is_high_confidence || false,
      estimatedUpside: d.estimated_upside || '50-100%',
      discoveredAt: d.discovered_at,
      riskLevel: d.risk_level || 'MODERATE',
      recommendation: d.recommendation || 'BUY'
    }));
    
    if (discoveries.length === 0) {
      console.log('📊 No discoveries in database yet');
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
    console.error('❌ Discovery fetch error:', error.message);
    viglDiscoveryCache = [];
    lastViglScan = Date.now();
    return [];
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

// Health check with schema validation
app.get('/api/health', (req, res) => {
  const dbPath = process.env.SQLITE_DB_PATH || require('path').join(__dirname, 'trading_dashboard.db');
  
  let schemaStatus = 'ok';
  try {
    const db = require('./server/db/sqlite');
    // Test critical tables exist by attempting to prepare statements
    const requiredTables = ['features_snapshot', 'discoveries', 'theses', 'trading_decisions', 'scoring_weights'];
    
    for (const table of requiredTables) {
      try {
        db.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
      } catch (error) {
        if (error.message.includes('no such table')) {
          schemaStatus = 'missing';
          break;
        }
      }
    }
  } catch (error) {
    schemaStatus = 'error';
  }

  res.json({
    status: 'ok',
    model: 'squeeze-engine',
    preset: 'june_july_proven',
    db_path: dbPath,
    schema: schemaStatus,
    timestamp: new Date().toISOString()
  });
});

// Enhanced health endpoint with data feeds status
app.get('/api/healthz', async (req, res) => {
  const { runHeartbeat, allHealthy } = require('./server/health/heartbeat');
  const dbPath = process.env.SQLITE_DB_PATH || require('path').join(__dirname, 'trading_dashboard.db');
  
  let schemaStatus = 'ok';
  try {
    const db = require('./server/db/sqlite');
    const requiredTables = ['features_snapshot', 'discoveries', 'theses', 'trading_decisions', 'scoring_weights_kv', 'data_status'];
    
    for (const table of requiredTables) {
      try {
        db.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
      } catch (error) {
        if (error.message.includes('no such table')) {
          schemaStatus = 'missing';
          break;
        }
      }
    }
  } catch (error) {
    schemaStatus = 'error';
  }

  // Get data feeds status
  let feeds = {};
  let overallStatus = 'healthy';
  try {
    const snap = await runHeartbeat();
    snap.forEach(s => feeds[s.source] = s.status);
    if (!allHealthy(snap)) {
      overallStatus = 'degraded';
    }
  } catch (error) {
    overallStatus = 'degraded';
    feeds = { error: 'Failed to check data feeds' };
  }

  res.json({
    status: overallStatus,
    schema: schemaStatus,
    db_path: dbPath,
    feeds,
    timestamp: new Date().toISOString()
  });
});

// Middleware for health checks
const requireHealthy = require('./server/middleware/requireHealthy');

// Secure admin scan endpoint (health check disabled while Alpaca is down)
app.post('/api/admin/scan', requireAuth, async (req, res) => {
  try {
    console.log('🔒 Admin-triggered scan initiated');
    
    // Run the capture job
    const capture = require('./server/jobs/capture');
    await capture.runDiscoveryCapture();
    
    // Get latest discoveries
    const db = require('./server/db/sqlite');
    const discoveries = await db.getTodaysDiscoveries();
    
    res.json({
      success: true,
      message: 'Scan completed successfully',
      timestamp: new Date().toISOString(),
      discoveries_count: discoveries.length,
      discoveries: discoveries.slice(0, 10) // Top 10 for response size
    });
    
  } catch (error) {
    console.error('❌ Admin scan failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Scan failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Admin fix dashboard endpoint - runs Python script to fix data flow
app.post('/api/admin/fix-dashboard', requireAuth, async (req, res) => {
  const { spawn } = require('child_process');
  const path = require('path');
  
  try {
    console.log('🔧 Starting dashboard fix process...');
    
    // Path to Python script
    const scriptPath = path.join(__dirname, 'server', 'fix_dashboard_connection_v2.py');
    
    // Set DB path environment variable
    const env = Object.assign({}, process.env, {
      DB_PATH: path.join(__dirname, 'trading_dashboard.db'),
      POLYGON_API_KEY: process.env.POLYGON_API_KEY
    });
    
    // Spawn Python process
    const pythonProcess = spawn('python3', [scriptPath], {
      env: env,
      cwd: __dirname
    });
    
    let output = '';
    let errorOutput = '';
    
    // Stream output
    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(text.trim());
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error(text.trim());
    });
    
    // Handle completion
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // Success - get updated discoveries
        const db = require('./server/db/sqlite');
        const discoveries = db.db.prepare('SELECT COUNT(*) as count FROM discoveries').get();
        
        res.json({
          success: true,
          message: 'Dashboard fixed successfully',
          discoveries_count: discoveries.count,
          output: output,
          timestamp: new Date().toISOString()
        });
      } else {
        // Failure
        res.status(500).json({
          success: false,
          error: 'Fix process failed',
          code: code,
          output: output,
          error_output: errorOutput,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (err) => {
      console.error('❌ Failed to start fix process:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to start fix process',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    });
    
  } catch (error) {
    console.error('❌ Fix dashboard error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Fix dashboard failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Admin validated fix endpoint - uses real market data with strict validation
app.post('/api/admin/fix-dashboard-validated', requireAuth, async (req, res) => {
  const { spawn } = require('child_process');
  const path = require('path');
  
  try {
    console.log('🔒 Starting VALIDATED dashboard fix with real market data...');
    
    // Path to Python script with validation
    const scriptPath = path.join(__dirname, 'server', 'fix_dashboard_connection_v3.py');
    
    // Set environment variables for production validation
    const env = Object.assign({}, process.env, {
      SQLITE_DB_PATH: process.env.SQLITE_DB_PATH || path.join(__dirname, 'trading_dashboard.db'),
      POLYGON_API_KEY: process.env.POLYGON_API_KEY,
      NODE_ENV: process.env.NODE_ENV || 'production'
    });
    
    // Validate API key exists
    if (!env.POLYGON_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'MISSING_API_KEY',
        message: 'Polygon API key required for real market data validation'
      });
    }
    
    console.log('🔑 API Key verified, fetching real market data...');
    
    // Spawn Python validation process
    const pythonProcess = spawn('python3', [scriptPath], {
      env: env,
      cwd: __dirname
    });
    
    let output = '';
    let errorOutput = '';
    let discoveryCount = 0;
    
    // Stream output
    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(text.trim());
      
      // Extract discovery count from output
      const countMatch = text.match(/Successfully inserted (\d+) VALIDATED discoveries/);
      if (countMatch) {
        discoveryCount = parseInt(countMatch[1]);
      }
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error('Fix script error:', text.trim());
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      const timestamp = new Date().toISOString();
      
      if (code === 0) {
        console.log('✅ Validated fix process completed successfully');
        res.json({
          success: true,
          message: `Dashboard fixed with REAL validated market data`,
          discoveries_count: discoveryCount,
          validation_status: 'REAL_DATA_VALIDATED',
          output: output,
          timestamp: timestamp
        });
      } else {
        console.error('❌ Validated fix process failed with code:', code);
        res.status(500).json({
          success: false,
          error: 'VALIDATION_FAILED',
          message: `Real data validation failed (exit code: ${code})`,
          output: output,
          error_output: errorOutput,
          timestamp: timestamp
        });
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      console.error('❌ Failed to start validated fix process:', error);
      res.status(500).json({
        success: false,
        error: 'PROCESS_START_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });
    
    // Set timeout for real market data fetching
    setTimeout(() => {
      if (!res.headersSent) {
        pythonProcess.kill();
        res.status(408).json({
          success: false,
          error: 'VALIDATION_TIMEOUT',
          message: 'Real market data validation timed out after 60 seconds',
          timestamp: new Date().toISOString()
        });
      }
    }, 60000); // 60 second timeout for API calls
    
  } catch (error) {
    console.error('❌ Validated fix endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint - Alpaca environment diagnostics
app.get('/api/admin/debug-alpaca', requireAuth, async (req, res) => {
  try {
    const { debugAlpacaEnvironment } = require('./server/debug_alpaca_env');
    
    // Capture console output
    const originalLog = console.log;
    const originalError = console.error;
    let output = '';
    
    console.log = (...args) => {
      const message = args.join(' ');
      output += message + '\n';
      originalLog(...args);
    };
    
    console.error = (...args) => {
      const message = args.join(' ');
      output += 'ERROR: ' + message + '\n';
      originalError(...args);
    };
    
    // Run debug
    const success = await debugAlpacaEnvironment();
    
    // Restore console
    console.log = originalLog;
    console.error = originalError;
    
    res.json({
      success,
      output,
      timestamp: new Date().toISOString(),
      environment_vars: {
        has_apca_key_id: !!process.env.APCA_API_KEY_ID,
        has_apca_secret: !!process.env.APCA_API_SECRET_KEY,
        has_base_url: !!process.env.APCA_API_BASE_URL,
        base_url: process.env.APCA_API_BASE_URL || 'default',
        node_env: process.env.NODE_ENV
      }
    });
    
  } catch (error) {
    console.error('❌ Debug Alpaca endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test Alpaca API directly from Node.js environment
app.get('/api/admin/test-alpaca-direct', requireAuth, async (req, res) => {
  try {
    const https = require('https');
    const apiKey = process.env.APCA_API_KEY_ID;
    const secretKey = process.env.APCA_API_SECRET_KEY;
    const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
    
    // Make direct API call
    const url = new URL(baseUrl);
    const options = {
      hostname: url.hostname,
      path: '/v2/account',
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey
      }
    };
    
    const result = await new Promise((resolve) => {
      const req = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            headers: response.headers,
            body: data
          });
        });
      });
      
      req.on('error', (err) => {
        resolve({ error: err.message });
      });
      
      req.end();
    });
    
    res.json({
      environment: {
        api_key: apiKey ? `${apiKey.substring(0, 5)}...${apiKey.substring(15)}` : 'NOT SET',
        secret_key: secretKey ? 'SET' : 'NOT SET',
        secret_key_pattern: secretKey ? `${secretKey.substring(0, 5)}...${secretKey.substring(secretKey.length - 5)}` : 'NOT SET',
        base_url: baseUrl,
        node_env: process.env.NODE_ENV
      },
      request: {
        url: `https://${options.hostname}${options.path}`,
        headers_sent: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': '[REDACTED]'
        }
      },
      response: {
        statusCode: result.statusCode,
        statusMessage: result.statusMessage,
        body: result.body ? JSON.parse(result.body) : null
      },
      diagnosis: result.statusCode === 403 ? 
        'Environment variables may not be loaded correctly or process needs restart' :
        result.statusCode === 200 ? 'API working correctly' : 'Unexpected status'
    });
    
  } catch (error) {
    res.status(500).json({
      error: error.message,
      environment: {
        has_api_key: !!process.env.APCA_API_KEY_ID,
        has_secret_key: !!process.env.APCA_API_SECRET_KEY
      }
    });
  }
});

// Debug endpoint - Alpaca 403 error diagnostics
app.get('/api/admin/debug-alpaca-403', requireAuth, async (req, res) => {
  try {
    const { debugAlpaca403 } = require('./server/debug_alpaca_403');
    
    // Capture console output
    const originalLog = console.log;
    const originalError = console.error;
    let output = '';
    
    console.log = (...args) => {
      const message = args.join(' ');
      output += message + '\n';
      originalLog(...args);
    };
    
    console.error = (...args) => {
      const message = args.join(' ');
      output += 'ERROR: ' + message + '\n';
      originalError(...args);
    };
    
    // Run 403 debug
    const success = await debugAlpaca403();
    
    // Restore console
    console.log = originalLog;
    console.error = originalError;
    
    // Extract key diagnostic info
    const apiKey = process.env.APCA_API_KEY_ID;
    const secretKey = process.env.APCA_API_SECRET_KEY;
    
    res.json({
      success,
      output,
      timestamp: new Date().toISOString(),
      environment_diagnostics: {
        api_key_pattern: apiKey ? `${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}` : 'NOT SET',
        api_key_length: apiKey ? apiKey.length : 0,
        has_whitespace: apiKey ? /\s/.test(apiKey) || /\s/.test(secretKey) : null,
        has_special_chars: apiKey ? /[^\w-]/.test(apiKey) : null,
        base_url: process.env.APCA_API_BASE_URL || 'default',
        expected_key_match: apiKey ? apiKey.startsWith('PKX1W') && apiKey.endsWith('LBAR8') : false
      }
    });
    
  } catch (error) {
    console.error('❌ Debug Alpaca 403 endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint - check database directly for VIGL symbols
app.get('/api/admin/debug-db', requireAuth, (req, res) => {
  try {
    const db = require('./server/db/sqlite');
    
    // Get total discoveries
    const total = db.db.prepare('SELECT COUNT(*) as count FROM discoveries').get();
    
    // Get VIGL symbols specifically
    const viglSymbols = db.db.prepare(`
      SELECT symbol, score, created_at, 
      substr(features_json, 1, 100) as features_preview
      FROM discoveries 
      WHERE symbol IN ('MRM','SPRU','ORIS','HRTX','BTAI')
      ORDER BY score DESC
    `).all();
    
    // Get top 10 by score
    const topScores = db.db.prepare(`
      SELECT symbol, score, created_at
      FROM discoveries 
      ORDER BY score DESC LIMIT 10
    `).all();
    
    res.json({
      success: true,
      database_path: db.db.name || 'unknown',
      total_discoveries: total.count,
      vigl_discoveries: viglSymbols,
      top_discoveries: topScores,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Admin status endpoint
app.get('/api/admin/status', requireAuth, (req, res) => {
  const db = require('./server/db/sqlite');
  
  try {
    const todaysDiscoveries = db.getTodaysDiscoveries();
    const latestFeatures = db.getLatestDiscoveries(5);
    
    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      database: {
        discoveries_today: todaysDiscoveries.length,
        latest_discoveries: latestFeatures.length,
        database_path: process.env.SQLITE_DB_PATH || 'default'
      },
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3001,
        has_polygon_key: !!process.env.POLYGON_API_KEY,
        has_alpaca_keys: !!(process.env.APCA_API_KEY_ID && process.env.APCA_API_SECRET_KEY)
      },
      scoring: {
        weights_configured: !!process.env.SCORING_WEIGHTS_JSON
      }
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Admin data status endpoint - shows heartbeat of all data sources
app.get('/api/admin/data-status', requireAuth, async (req, res) => {
  const { runHeartbeat, allHealthy } = require('./server/health/heartbeat');
  try {
    const snap = await runHeartbeat();
    res.json({
      ok: allHealthy(snap),
      overall: allHealthy(snap) ? 'OK' : 'DEGRADED',
      sources: snap,
      version: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local'
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      overall: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

// Debug endpoint specifically for portfolio frontend issue
app.get('/api/debug/portfolio-frontend', async (req, res) => {
  try {
    const portfolio = await fetchAlpacaPositions();
    
    res.json({
      debug_info: {
        environment: process.env.NODE_ENV || 'development',
        has_alpaca_credentials: {
          api_key: !!process.env.APCA_API_KEY_ID,
          secret_key: !!process.env.APCA_API_SECRET_KEY,
          base_url: !!process.env.APCA_API_BASE_URL
        },
        alpaca_config: {
          hasApiKey: !!ALPACA_CONFIG.apiKey,
          hasSecretKey: !!ALPACA_CONFIG.secretKey,
          baseUrl: ALPACA_CONFIG.baseUrl,
          apiKeyLength: ALPACA_CONFIG.apiKey?.length || 0,
          secretKeyLength: ALPACA_CONFIG.secretKey?.length || 0
        }
      },
      portfolio_status: {
        isConnected: portfolio.isConnected,
        positions_count: portfolio.positions?.length || 0,
        totalValue: portfolio.totalValue || 0,
        hasPositions: (portfolio.positions?.length || 0) > 0
      },
      first_position_sample: portfolio.positions?.[0] || null,
      frontend_expectation: {
        expects_array: 'data.portfolio.positions',
        expects_connected: 'data.portfolio.isConnected', 
        renders_when: 'positions.length > 0',
        shows_message_when: 'positions.length === 0: "No positions found..."'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      debug_info: {
        has_alpaca_credentials: {
          api_key: !!process.env.APCA_API_KEY_ID,
          secret_key: !!process.env.APCA_API_SECRET_KEY,
          base_url: !!process.env.APCA_API_BASE_URL
        }
      }
    });
  }
});

// Fetch portfolio alerts from API
async function fetchPortfolioAlerts() {
  const viglApiUrl = process.env.VIGL_API_URL || 'https://vigl-api-service.onrender.com';
  const https = require('https');
  
  try {
    const response = await new Promise((resolve, reject) => {
      https.get(`${viglApiUrl}/portfolio/critical`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ data: [] });
          }
        });
      }).on('error', () => resolve({ data: [] }));
    });
    
    return response.data || [];
  } catch (error) {
    console.log('Portfolio alerts unavailable');
    return [];
  }
}

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
    
    // Fetch real portfolio alerts from API service
    const portfolioAlerts = await fetchPortfolioAlerts();
    
    // Combine with existing alert system
    const alerts = await generateAlerts(portfolio, discoveries);
    
    // Add critical portfolio alerts to the top
    if (portfolioAlerts.length > 0) {
      portfolioAlerts.forEach(alert => {
        alerts.unshift({
          id: `portfolio-${alert.symbol}`,
          type: 'PORTFOLIO',
          severity: alert.alert_level === 'CRITICAL' ? 'HIGH' : alert.alert_level,
          title: `${alert.symbol}: ${alert.action}`,
          message: alert.message,
          symbol: alert.symbol,
          timestamp: alert.created_at,
          action: alert.action
        });
      });
    }
    
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

// Startup health check - can be enabled with STRICT_STARTUP=true
if (process.env.STRICT_STARTUP === 'true') {
  (async () => {
    const { runHeartbeat, allHealthy } = require('./server/health/heartbeat');
    console.log('🔍 Performing startup health check...');
    
    try {
      const snap = await runHeartbeat();
      if (!allHealthy(snap)) {
        console.error('❌ Startup blocked: data feeds not healthy');
        snap.forEach(s => {
          if (s.status !== 'OK') {
            console.error(`  - ${s.source}: ${s.status} (${s.detail})`);
          }
        });
        console.error('🚫 Server will not start with degraded data feeds in strict mode');
        process.exit(1);
      }
      console.log('✅ All data feeds healthy - starting server');
    } catch (error) {
      console.error('❌ Startup health check failed:', error.message);
      process.exit(1);
    }
  })();
} else {
  console.log('ℹ️  Startup health check disabled (set STRICT_STARTUP=true to enable)');
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Trading Intelligence Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/dashboard`);
  console.log(`🔑 Alpaca Connected: ${!!ALPACA_CONFIG.apiKey}`);
  
  // Start capture job for continuous data collection
  try {
    const capture = require('./server/jobs/capture');
    capture.startDailyCapture();
    console.log('📡 Capture job started - will run every 30 minutes');
  } catch (error) {
    console.error('⚠️ Failed to start capture job:', error.message);
  }
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});