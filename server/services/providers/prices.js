/**
 * Alpaca Market Data v2 Price Provider
 * Real-time quotes and last trade data
 */

/**
 * Get latest quote for a symbol from Alpaca Market Data v2
 * @param {string} symbol Stock symbol
 * @returns {Promise<Object>} Quote data with bid/ask/timestamp
 */
async function getQuote(symbol) {
  const apiKey = process.env.APCA_API_KEY_ID;
  const secretKey = process.env.APCA_API_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    throw new Error('Alpaca API credentials not configured (APCA_API_KEY_ID, APCA_API_SECRET_KEY)');
  }

  try {
    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`;
    
    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey
      },
      timeout: 8000
    });

    if (!response.ok) {
      throw new Error(`Alpaca Market Data API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.quote) {
      throw new Error(`No quote data returned for ${symbol}`);
    }

    const quote = data.quote;
    
    return {
      symbol,
      bid: quote.bp,
      ask: quote.ap,
      bid_size: quote.bs,
      ask_size: quote.as,
      spread: quote.ap - quote.bp,
      midpoint: (quote.ap + quote.bp) / 2,
      timestamp: quote.t,
      source: 'alpaca_market_data',
      updated_at: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Failed to fetch quote for ${symbol}: ${error.message}`);
  }
}

/**
 * Get latest trade for a symbol from Alpaca Market Data v2
 * @param {string} symbol Stock symbol  
 * @returns {Promise<Object>} Last trade data with price/volume/timestamp
 */
async function getLastTrade(symbol) {
  const apiKey = process.env.APCA_API_KEY_ID;
  const secretKey = process.env.APCA_API_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    throw new Error('Alpaca API credentials not configured (APCA_API_KEY_ID, APCA_API_SECRET_KEY)');
  }

  try {
    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/trades/latest`;
    
    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey
      },
      timeout: 8000
    });

    if (!response.ok) {
      throw new Error(`Alpaca Market Data API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.trade) {
      throw new Error(`No trade data returned for ${symbol}`);
    }

    const trade = data.trade;
    
    return {
      symbol,
      price: trade.p,
      size: trade.s,
      timestamp: trade.t,
      conditions: trade.c || [],
      exchange: trade.x,
      source: 'alpaca_market_data',
      updated_at: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Failed to fetch last trade for ${symbol}: ${error.message}`);
  }
}

/**
 * Test Alpaca Market Data connectivity
 * @returns {Promise<Object>} Status object
 */
async function testConnection() {
  try {
    // Test with AAPL quote
    await getQuote('AAPL');
    
    return {
      status: 'OK',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    throw new Error(`Alpaca Market Data connection failed: ${error.message}`);
  }
}

module.exports = {
  getQuote,
  getLastTrade,
  testConnection
};