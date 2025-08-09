/**
 * Borrow/Short Interest Provider
 * Supports Fintel API for real borrow fee and availability data
 */

/**
 * Get borrow/short data for a symbol
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Borrow data with fee/availability
 */
async function getBorrowData(symbol) {
  const provider = process.env.BORROW_SHORT_PROVIDER;
  
  if (!provider) {
    throw new Error('BORROW_SHORT_PROVIDER not configured - required in strict mode');
  }
  
  if (provider === 'fintel') {
    return await getFintelBorrowData(symbol);
  }
  
  throw new Error(`Unsupported borrow provider: ${provider}. Supported: fintel`);
}

/**
 * Fetch borrow data from Fintel API
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Fintel borrow data
 */
async function getFintelBorrowData(symbol) {
  const apiKey = process.env.BORROW_SHORT_API_KEY;
  
  if (!apiKey) {
    throw new Error('BORROW_SHORT_API_KEY not configured - required for Fintel provider');
  }
  
  try {
    // Fintel API endpoint for borrow data
    const url = `https://api.fintel.io/api/v1/shortInterest/${symbol}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Fintel API authentication failed - check BORROW_SHORT_API_KEY');
      }
      if (response.status === 403) {
        throw new Error('Fintel API access denied - check API key permissions');
      }
      if (response.status === 429) {
        throw new Error('Fintel API rate limit exceeded');
      }
      throw new Error(`Fintel API error: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid Fintel API response for ${symbol}`);
    }
    
    // Parse Fintel response format (adjust based on actual API structure)
    return {
      symbol: symbol.toUpperCase(),
      short_interest_pct: parseFloat(data.shortInterestPercent) || 0,
      borrow_fee_pct: parseFloat(data.borrowFeePercent) || 0,
      shares_available: parseInt(data.sharesAvailable) || 0,
      shares_short: parseInt(data.sharesShort) || 0,
      fee_change_7d: parseFloat(data.feeChange7d) || 0,
      utilization_pct: parseFloat(data.utilizationPercent) || 0,
      asof: data.asOf || new Date().toISOString(),
      source: 'fintel',
      updated_at: new Date().toISOString()
    };
    
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error(`Fintel API connection failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Test borrow provider connectivity
 * @returns {Promise<Object>} Status object
 */
async function testConnection() {
  const provider = process.env.BORROW_SHORT_PROVIDER;
  
  if (!provider) {
    throw new Error('BORROW_SHORT_PROVIDER not configured');
  }
  
  if (provider === 'fintel') {
    return await testFintelConnection();
  }
  
  throw new Error(`Unsupported borrow provider: ${provider}`);
}

/**
 * Test Fintel API connectivity
 * @returns {Promise<Object>} Status object
 */
async function testFintelConnection() {
  const apiKey = process.env.BORROW_SHORT_API_KEY;
  
  if (!apiKey) {
    throw new Error('BORROW_SHORT_API_KEY not configured');
  }
  
  try {
    // Test with a common symbol
    await getBorrowData('AAPL');
    
    return {
      status: 'OK',
      provider: 'fintel',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    throw new Error(`Fintel connection test failed: ${error.message}`);
  }
}

/**
 * Validate borrow provider configuration at startup
 * @throws {Error} If required configuration is missing
 */
function validateBorrowConfig() {
  const provider = process.env.BORROW_SHORT_PROVIDER;
  
  if (!provider) {
    throw new Error('BORROW_SHORT_PROVIDER environment variable is required');
  }
  
  if (provider === 'fintel') {
    if (!process.env.BORROW_SHORT_API_KEY) {
      throw new Error('BORROW_SHORT_API_KEY is required when BORROW_SHORT_PROVIDER=fintel');
    }
  } else {
    throw new Error(`Unsupported BORROW_SHORT_PROVIDER: ${provider}. Supported providers: fintel`);
  }
  
  console.log(`✅ Borrow provider configured: ${provider}`);
}

module.exports = {
  getBorrowData,
  testConnection,
  validateBorrowConfig
};