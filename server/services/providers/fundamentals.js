/**
 * Minimal fundamentals provider
 * Returns basic company data without external API dependencies
 */

// Simple company data cache with estimated values
const COMPANY_ESTIMATES = {
  'AAPL': { name: 'Apple Inc.', sector: 'Technology', float_shares: 15500000000, market_cap: 3000000000000 },
  'TSLA': { name: 'Tesla Inc.', sector: 'Consumer Discretionary', float_shares: 3100000000, market_cap: 800000000000 },
  'NVDA': { name: 'NVIDIA Corporation', sector: 'Technology', float_shares: 2450000000, market_cap: 1800000000000 },
  'AMD': { name: 'Advanced Micro Devices', sector: 'Technology', float_shares: 1600000000, market_cap: 240000000000 },
  'MSFT': { name: 'Microsoft Corporation', sector: 'Technology', float_shares: 7430000000, market_cap: 2800000000000 },
  'AMZN': { name: 'Amazon.com Inc.', sector: 'Consumer Discretionary', float_shares: 10300000000, market_cap: 1500000000000 },
  'META': { name: 'Meta Platforms Inc.', sector: 'Communication Services', float_shares: 2650000000, market_cap: 1300000000000 },
  'GOOGL': { name: 'Alphabet Inc.', sector: 'Communication Services', float_shares: 5840000000, market_cap: 2000000000000 }
};

/**
 * Get basic company information
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Company data
 */
async function getCompanyProfile(symbol) {
  try {
    // Return cached estimate if available
    const estimate = COMPANY_ESTIMATES[symbol.toUpperCase()];
    if (estimate) {
      return {
        symbol: symbol.toUpperCase(),
        company_name: estimate.name,
        sector: estimate.sector,
        industry: 'Technology', // Default
        float_shares: estimate.float_shares,
        market_cap: estimate.market_cap,
        shares_outstanding: estimate.float_shares,
        source: 'static_estimate',
        updated_at: new Date().toISOString()
      };
    }
    
    // Default fallback for unknown symbols
    return {
      symbol: symbol.toUpperCase(),
      company_name: `${symbol.toUpperCase()} Inc.`,
      sector: 'Technology',
      industry: 'Technology',
      float_shares: 1000000000, // 1B shares default
      market_cap: 50000000000,  // 50B market cap default
      shares_outstanding: 1000000000,
      source: 'default_estimate',
      updated_at: new Date().toISOString()
    };
    
  } catch (error) {
    throw new Error(`Failed to get company profile for ${symbol}: ${error.message}`);
  }
}

/**
 * Test connectivity (always succeeds for static data)
 * @returns {Promise<Object>} Status object
 */
async function testConnection() {
  return {
    status: 'OK',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getCompanyProfile,
  testConnection
};