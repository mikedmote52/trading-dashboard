#!/usr/bin/env node
/**
 * Trading Intelligence Dashboard - Complete Backend
 * Unified VIGL Discovery + Portfolio Management in single deployment
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

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
            resolve(null);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          console.error('❌ Failed to parse Alpaca response:', e.message);
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
      console.log('⚠️ No Alpaca data received, using mock data');
      return generateMockPortfolio();
    }
    
    console.log(`✅ Found ${positions.length} real positions from Alpaca`);

    return {
      positions: positions.map(pos => ({
        symbol: pos.symbol,
        qty: parseFloat(pos.qty),
        currentPrice: parseFloat(pos.current_price || pos.market_value / pos.qty),
        marketValue: parseFloat(pos.market_value),
        unrealizedPnL: parseFloat(pos.unrealized_pl),
        unrealizedPnLPercent: parseFloat(pos.unrealized_plpc) * 100,
        avgEntryPrice: parseFloat(pos.avg_entry_price),
        side: pos.side
      })),
      totalValue: parseFloat(account.portfolio_value || 0),
      dailyPnL: parseFloat(account.todays_pl || 0),
      isConnected: true
    };
  } catch (error) {
    console.log('Using mock data - Alpaca connection failed:', error.message);
    return generateMockPortfolio();
  }
}

function generateMockPortfolio() {
  const mockPositions = [
    {
      symbol: 'AAPL',
      qty: 10,
      currentPrice: 185.50,
      marketValue: 1855.00,
      unrealizedPnL: 155.00,
      unrealizedPnLPercent: 9.13,
      avgEntryPrice: 170.00,
      side: 'long'
    },
    {
      symbol: 'TSLA',
      qty: 5,
      currentPrice: 245.30,
      marketValue: 1226.50,
      unrealizedPnL: -74.50,
      unrealizedPnLPercent: -5.73,
      avgEntryPrice: 260.20,
      side: 'long'
    },
    {
      symbol: 'NVDA',
      qty: 3,
      currentPrice: 825.60,
      marketValue: 2476.80,
      unrealizedPnL: 376.80,
      unrealizedPnLPercent: 17.95,
      avgEntryPrice: 700.00,
      side: 'long'
    }
  ];

  return {
    positions: mockPositions,
    totalValue: 25847.30,
    dailyPnL: 457.30,
    isConnected: false
  };
}

// =============================================================================
// WOLF RISK ANALYSIS
// =============================================================================

function analyzePositionRisk(position) {
  const { unrealizedPnLPercent, currentPrice, avgEntryPrice, symbol } = position;
  
  // WOLF Risk Calculation (prevents -25% losses)
  let wolfScore = 0.3; // Base risk
  
  // Price decline risk
  if (unrealizedPnLPercent < -20) wolfScore += 0.4;
  else if (unrealizedPnLPercent < -15) wolfScore += 0.3;
  else if (unrealizedPnLPercent < -10) wolfScore += 0.2;
  
  // Volatility factor (mock calculation)
  const volatility = Math.abs(unrealizedPnLPercent) / 10;
  wolfScore += Math.min(volatility * 0.1, 0.2);
  
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

function scanForViglPatterns() {
  // Mock VIGL-like discoveries (in production, this would scan market data)
  const mockDiscoveries = [
    {
      symbol: 'MKTW',
      name: 'MarketWatch Corp',
      currentPrice: 3.45,
      marketCap: 45e6,
      volumeSpike: 18.5,
      momentum: 67.8,
      breakoutStrength: 0.8,
      sector: 'Technology',
      catalysts: ['FDA approval expected', 'Insider buying']
    },
    {
      symbol: 'BIOX',
      name: 'BioTech Innovations',
      currentPrice: 4.12,
      marketCap: 62e6,
      volumeSpike: 15.2,
      momentum: 45.3,
      breakoutStrength: 0.7,
      sector: 'Biotechnology',
      catalysts: ['Clinical trial results', 'Partnership rumor']
    },
    {
      symbol: 'ENRG',
      name: 'Energy Solutions Ltd',
      currentPrice: 2.78,
      marketCap: 38e6,
      volumeSpike: 22.1,
      momentum: 89.5,
      breakoutStrength: 0.9,
      sector: 'Energy',
      catalysts: ['Government contract', 'Earnings beat']
    }
  ];
  
  return mockDiscoveries.map(stock => {
    const viglAnalysis = calculateViglSimilarity(stock);
    return {
      ...stock,
      ...viglAnalysis,
      discoveredAt: new Date().toISOString(),
      riskLevel: viglAnalysis.confidence >= 0.8 ? 'MODERATE' : 'HIGH',
      recommendation: viglAnalysis.confidence >= 0.8 ? 'STRONG BUY' : viglAnalysis.confidence >= 0.6 ? 'BUY' : 'WATCH'
    };
  });
}

// =============================================================================
// ALERT SYSTEM
// =============================================================================

function generateAlerts(portfolio, discoveries) {
  const alerts = [];
  
  // Portfolio risk alerts
  portfolio.positions.forEach(position => {
    const risk = analyzePositionRisk(position);
    
    if (risk.wolfScore >= 0.8) {
      alerts.push({
        id: `risk-${position.symbol}`,
        type: 'RISK',
        severity: 'HIGH',
        title: `High Risk: ${position.symbol}`,
        message: `WOLF score ${risk.wolfScore} - ${risk.action}`,
        symbol: position.symbol,
        timestamp: new Date().toISOString(),
        action: risk.recommendation
      });
    }
  });
  
  // Discovery alerts
  discoveries.forEach(discovery => {
    if (discovery.confidence >= 0.8) {
      alerts.push({
        id: `discovery-${discovery.symbol}`,
        type: 'OPPORTUNITY',
        severity: 'HIGH',
        title: `VIGL Pattern: ${discovery.symbol}`,
        message: `${discovery.confidence * 100}% similarity - ${discovery.estimatedUpside} potential`,
        symbol: discovery.symbol,
        timestamp: new Date().toISOString(),
        action: discovery.recommendation
      });
    }
  });
  
  return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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

// Main dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const portfolio = await fetchAlpacaPositions();
    
    // Add risk analysis to each position
    portfolio.positions = portfolio.positions.map(position => ({
      ...position,
      riskAnalysis: analyzePositionRisk(position)
    }));
    
    const discoveries = scanForViglPatterns();
    const alerts = generateAlerts(portfolio, discoveries);
    
    dashboardData = {
      portfolio,
      discoveries,
      alerts,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalValue: portfolio.totalValue,
        dailyPnL: portfolio.dailyPnL,
        viglScore: discoveries.length > 0 ? Math.max(...discoveries.map(d => d.confidence)) : 0,
        avgWolfRisk: portfolio.positions.length > 0 
          ? portfolio.positions.reduce((sum, p) => sum + p.riskAnalysis.wolfScore, 0) / portfolio.positions.length
          : 0,
        highRiskPositions: portfolio.positions.filter(p => p.riskAnalysis.wolfScore >= 0.6).length,
        viglOpportunities: discoveries.filter(d => d.confidence >= 0.6).length
      }
    };
    
    res.json(dashboardData);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
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
      result.discoveries = scanForViglPatterns();
    }
    
    result.timestamp = new Date().toISOString();
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

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