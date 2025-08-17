// Polygon.io provider for minute bars and advanced technicals
const axios = require('axios');

class PolygonProvider {
  constructor() {
    this.apiKey = process.env.POLYGON_API_KEY;
    this.baseUrl = 'https://api.polygon.io';
  }

  async minuteBarsToday(symbol) {
    if (!this.apiKey) return [];
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const url = `${this.baseUrl}/v2/aggs/ticker/${symbol}/range/1/minute/${today}/${today}?apikey=${this.apiKey}`;
      
      const response = await axios.get(url, { timeout: 5000 });
      
      if (response.data?.results) {
        return response.data.results.map(bar => ({
          timestamp: bar.t,
          open: bar.o,
          high: bar.h, 
          low: bar.l,
          close: bar.c,
          volume: bar.v,
          vwap: bar.vw
        }));
      }
      
      return [];
    } catch (error) {
      console.warn(`⚠️ Failed to fetch minute bars for ${symbol}:`, error.message);
      return [];
    }
  }

  async adv30(symbol) {
    if (!this.apiKey) return null;
    
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const url = `${this.baseUrl}/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?apikey=${this.apiKey}`;
      
      const response = await axios.get(url, { timeout: 5000 });
      
      if (response.data?.results && response.data.results.length > 0) {
        const avgVolume = response.data.results
          .reduce((sum, day) => sum + day.v, 0) / response.data.results.length;
        return Math.round(avgVolume);
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️ Failed to fetch ADV30 for ${symbol}:`, error.message);
      return null;
    }
  }
}

// Technical analysis helpers
function ema(values, period) {
  if (values.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b) / period;
  
  for (let i = period; i < values.length; i++) {
    ema = (values[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Calculate RSI using smoothed averages
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function vwap(bars) {
  if (!bars || bars.length === 0) return null;
  
  let totalPV = 0;
  let totalVolume = 0;
  
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    totalPV += typical * bar.volume;
    totalVolume += bar.volume;
  }
  
  return totalVolume > 0 ? totalPV / totalVolume : null;
}

module.exports = {
  PolygonProvider,
  ema,
  rsi,
  vwap
};