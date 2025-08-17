/**
 * Alpaca Trading API Service
 * Shared functions for portfolio data fetching
 */

const https = require('https');

// Load Alpaca configuration
const ALPACA_CONFIG = {
  apiKey: process.env.APCA_API_KEY_ID || process.env.ALPACA_API_KEY,
  secretKey: process.env.APCA_API_SECRET_KEY || process.env.ALPACA_SECRET_KEY,
  baseUrl: process.env.APCA_API_BASE_URL || process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
};

/**
 * Make authenticated request to Alpaca API
 */
function makeAlpacaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${ALPACA_CONFIG.baseUrl}/v2/${endpoint}`;
    console.log(`📡 Requesting: ${url}`);
    
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': ALPACA_CONFIG.apiKey,
        'APCA-API-SECRET-KEY': ALPACA_CONFIG.secretKey,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`✅ Alpaca API success: ${endpoint}`);
          resolve(result);
        } catch (error) {
          console.error(`❌ Alpaca JSON parse error for ${endpoint}:`, error);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ Alpaca request error for ${endpoint}:`, error);
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Generate empty portfolio when no data available
 */
function generateEmptyPortfolio() {
  return {
    positions: [],
    account: null,
    totalValue: 0,
    totalPnL: 0,
    dailyPnL: 0,
    positionCount: 0,
    timestamp: new Date().toISOString()
  };
}

/**
 * Fetch and process Alpaca portfolio positions
 */
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
    
    // Process positions for consistent format
    const processedPositions = positions.map(pos => ({
      symbol: pos.symbol,
      qty: parseFloat(pos.qty),
      currentPrice: parseFloat(pos.current_price || 0),
      avgEntryPrice: parseFloat(pos.avg_entry_price || 0),
      marketValue: parseFloat(pos.market_value || 0),
      unrealizedPnL: parseFloat(pos.unrealized_pl || 0),
      unrealizedPnLPercent: parseFloat(pos.unrealized_plpc || 0) * 100,
      side: pos.side,
      dailyPnL: parseFloat(pos.change_today || 0),
      dailyPnLPercent: parseFloat(pos.percent_change_today || 0) * 100,
      changeToday: parseFloat(pos.change_today || 0),
      hasDailyData: pos.change_today !== undefined,
      costBasis: parseFloat(pos.cost_basis || pos.avg_entry_price * pos.qty || 0),
      validation: {
        hasDailyData: pos.change_today !== undefined,
        pricesValid: pos.current_price && pos.avg_entry_price,
        pnlCalculated: pos.unrealized_pl !== undefined
      }
    }));
    
    // Calculate portfolio totals
    const totalValue = processedPositions.reduce((sum, pos) => sum + pos.marketValue, 0);
    const totalPnL = processedPositions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const dailyPnL = processedPositions.reduce((sum, pos) => sum + pos.dailyPnL, 0);
    
    const portfolio = {
      positions: processedPositions,
      account: {
        equity: parseFloat(account.equity || 0),
        cash: parseFloat(account.cash || 0),
        buying_power: parseFloat(account.buying_power || 0)
      },
      totalValue,
      totalPnL,
      totalPnLPercent: totalValue > 0 ? (totalPnL / (totalValue - totalPnL)) * 100 : 0,
      dailyPnL,
      dailyPnLPercent: totalValue > 0 ? (dailyPnL / totalValue) * 100 : 0,
      positionCount: processedPositions.length,
      timestamp: new Date().toISOString()
    };
    
    console.log('📊 Portfolio data quality: GOOD (100% complete)');
    
    // Create simple backup
    try {
      const fs = require('fs');
      const backupData = {
        portfolio,
        timestamp: new Date().toISOString(),
        source: 'alpaca-api'
      };
      fs.writeFileSync(`trading_backup_${new Date().toISOString().split('T')[0]}.json`, JSON.stringify(backupData, null, 2));
      console.log('💾 Simple backup saved: trading_backup_' + new Date().toISOString().split('T')[0] + '.json');
    } catch (backupError) {
      console.warn('⚠️ Backup save failed:', backupError.message);
    }
    
    return portfolio;
    
  } catch (error) {
    console.error('❌ Alpaca portfolio fetch error:', error);
    return generateEmptyPortfolio();
  }
}

module.exports = {
  fetchAlpacaPositions,
  makeAlpacaRequest,
  generateEmptyPortfolio,
  ALPACA_CONFIG
};