/**
 * Hardened Polygon API client with timeouts and error handling
 */

const https = require('https');
const { URL } = require('url');

/**
 * Make a request to Polygon API with timeout and proper error handling
 * @param {string} path - API path (e.g., '/v2/aggs/ticker/AAPL/range/1/minute/2023-01-01/2023-01-02')
 * @param {object} params - Query parameters
 * @param {number} timeout - Timeout in milliseconds (default: 8000)
 * @returns {Promise<object>} API response
 */
async function pget(path, params = {}, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const url = new URL('https://api.polygon.io' + path);
        
        // Add query parameters
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value);
            }
        });
        
        // Add API key
        url.searchParams.set('apikey', process.env.POLYGON_API_KEY);
        
        const requestOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'TradingDashboard/1.0'
            },
            timeout: timeout
        };
        
        const req = https.request(url, requestOptions, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const result = JSON.parse(data);
                        resolve(result);
                    } else {
                        reject(new Error(`Polygon API error: ${res.statusCode} ${res.statusMessage}`));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse Polygon response: ${error.message}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`Polygon request failed: ${error.message}`));
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Polygon request timeout after ${timeout}ms`));
        });
        
        req.setTimeout(timeout);
        req.end();
    });
}

/**
 * Get current stock price with fallback
 */
async function getCurrentPrice(symbol, timeout = 5000) {
    try {
        const response = await pget(`/v2/last/trade/${symbol}`, {}, timeout);
        return {
            symbol: symbol,
            price: response.results?.price || null,
            timestamp: response.results?.timestamp || Date.now(),
            source: 'polygon'
        };
    } catch (error) {
        console.warn(`Failed to get price for ${symbol}: ${error.message}`);
        return {
            symbol: symbol,
            price: null,
            timestamp: Date.now(),
            source: 'error',
            error: error.message
        };
    }
}

/**
 * Get multiple stock prices with controlled concurrency
 */
async function getBatchPrices(symbols, maxConcurrency = 4, timeout = 5000) {
    const results = [];
    const chunks = [];
    
    // Split symbols into chunks to control concurrency
    for (let i = 0; i < symbols.length; i += maxConcurrency) {
        chunks.push(symbols.slice(i, i + maxConcurrency));
    }
    
    for (const chunk of chunks) {
        const chunkPromises = chunk.map(symbol => getCurrentPrice(symbol, timeout));
        const chunkResults = await Promise.allSettled(chunkPromises);
        
        chunkResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({
                    symbol: chunk[index],
                    price: null,
                    timestamp: Date.now(),
                    source: 'error',
                    error: result.reason?.message || 'Unknown error'
                });
            }
        });
        
        // Brief pause between chunks to avoid rate limiting
        if (chunks.indexOf(chunk) < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

module.exports = {
    pget,
    getCurrentPrice,
    getBatchPrices
};