const fetch = require('node-fetch');

class LiveDataService {
    constructor() {
        this.cache = new Map();
        this.updateInterval = 30000; // 30 seconds
        this.polygonApiKey = process.env.POLYGON_API_KEY;
    }
    
    async getLiveMetrics(symbol) {
        try {
            // Check cache first
            const cacheKey = `${symbol}_live`;
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.updateInterval) {
                return cached.data;
            }

            console.log(`🔴 Fetching live data for ${symbol}...`);
            
            // Get real-time quote
            const quote = await this.getLastQuote(symbol);
            if (!quote) return null;

            // Get recent minute bars for calculations
            const bars = await this.getMinuteBars(symbol, 30);
            if (!bars || bars.length === 0) return null;

            // Calculate live metrics
            const metrics = this.calculateLiveMetrics(bars, quote);
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: metrics,
                timestamp: Date.now()
            });

            return metrics;
        } catch (error) {
            console.error(`❌ Live data error for ${symbol}:`, error.message);
            return null;
        }
    }
    
    async getLastQuote(symbol) {
        try {
            const url = `https://api.polygon.io/v2/last/nbbo/${symbol}?apikey=${this.polygonApiKey}`;
            const response = await fetch(url);
            const data = await response.json();
            
            return data.results ? {
                price: data.results.P || data.results.p,
                timestamp: data.results.t
            } : null;
        } catch (error) {
            console.error(`Quote error for ${symbol}:`, error.message);
            return null;
        }
    }

    async getMinuteBars(symbol, count = 30) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${today}/${today}?adjusted=true&sort=desc&limit=${count}&apikey=${this.polygonApiKey}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            return data.results || [];
        } catch (error) {
            console.error(`Minute bars error for ${symbol}:`, error.message);
            return [];
        }
    }
    
    calculateLiveMetrics(bars, quote) {
        if (!bars.length || !quote) return null;

        const prices = bars.map(b => b.c);
        const volumes = bars.map(b => b.v);
        const highs = bars.map(b => b.h);
        const lows = bars.map(b => b.l);
        
        // VWAP calculation
        const vwap = this.calculateVWAP(bars);
        
        // RSI calculation (14 period)
        const rsi = this.calculateRSI(prices, 14);
        
        // EMA calculations
        const ema9 = this.calculateEMA(prices, 9);
        const ema20 = this.calculateEMA(prices, 20);
        
        // High of day and drawdown
        const hod = Math.max(...highs);
        const currentPrice = quote.price;
        const drawdownFromHOD = hod > 0 ? (hod - currentPrice) / hod : 0;
        
        // Average volume for relative volume calculation
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const currentVolume = bars[0]?.v || 0;
        const relativeVolume = avgVolume > 0 ? currentVolume / avgVolume : 0;

        return {
            live_price: currentPrice,
            live_vwap: vwap,
            live_rsi: rsi,
            ema9: ema9,
            ema20: ema20,
            ema9_ge_ema20: ema9 >= ema20,
            drawdown_from_hod: drawdownFromHOD,
            relative_volume: relativeVolume,
            hod: hod,
            timestamp: Date.now()
        };
    }
    
    calculateVWAP(bars) {
        let totalVolume = 0;
        let totalPriceVolume = 0;
        
        bars.forEach(bar => {
            const typicalPrice = (bar.h + bar.l + bar.c) / 3;
            totalVolume += bar.v;
            totalPriceVolume += typicalPrice * bar.v;
        });
        
        return totalVolume > 0 ? totalPriceVolume / totalVolume : 0;
    }
    
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50; // Default neutral RSI
        
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        // Simple moving average for first calculation
        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    
    calculateEMA(prices, period) {
        if (prices.length === 0) return 0;
        if (prices.length < period) return prices[0];
        
        const multiplier = 2 / (period + 1);
        let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
        
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
        }
        
        return ema;
    }

    // Batch processing for multiple symbols
    async getLiveMetricsForSymbols(symbols) {
        const promises = symbols.map(symbol => 
            this.getLiveMetrics(symbol).catch(error => {
                console.warn(`⚠️ Failed to get live data for ${symbol}:`, error.message);
                return null;
            })
        );
        
        const results = await Promise.all(promises);
        const metricsMap = {};
        
        symbols.forEach((symbol, index) => {
            metricsMap[symbol] = results[index];
        });
        
        return metricsMap;
    }

    clearCache() {
        this.cache.clear();
        console.log('🧹 Live data cache cleared');
    }
}

module.exports = new LiveDataService();