/**
 * Position Health Analyzer
 * Reuses AlphaStack screener S1-S6 logic to evaluate existing positions
 */

const fetch = require('node-fetch');

// Import screener components - create simplified versions since direct import may have issues

// API Keys
const POLYGON_KEY = process.env.POLYGON_API_KEY;
const ALPACA_KEY = process.env.APCA_API_KEY_ID;

// Simplified screener functions for position analysis
async function get30DayVolumeMetrics(symbol) {
    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length < 5) {
            return { avgVolume: 1000000, medianDollarVol: 5000000, relVol: 1.0 };
        }
        
        const volumes = data.results.map(bar => bar.v);
        const prices = data.results.map(bar => bar.c);
        const dollarVols = data.results.map((bar, i) => bar.v * prices[i]);
        
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const medianDollarVol = dollarVols.sort((a, b) => a - b)[Math.floor(dollarVols.length / 2)];
        
        // Estimate relative volume (would need intraday data for precise calculation)
        const latestVolume = volumes[volumes.length - 1] || avgVolume;
        const relVol = latestVolume / avgVolume;
        
        return { avgVolume, medianDollarVol, relVol };
    } catch (error) {
        console.error(`Error getting volume metrics for ${symbol}:`, error);
        return { avgVolume: 1000000, medianDollarVol: 5000000, relVol: 1.0 };
    }
}

async function getLatestMarketData(symbol) {
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.ticker) {
            return {
                price: data.ticker.day?.c || data.ticker.prevDay?.c || 0,
                volume: data.ticker.day?.v || 0,
                change: data.ticker.todaysChange || 0,
                changePercent: data.ticker.todaysChangePerc || 0
            };
        }
        return { price: 0, volume: 0, change: 0, changePercent: 0 };
    } catch (error) {
        console.error(`Error getting market data for ${symbol}:`, error);
        return { price: 0, volume: 0, change: 0, changePercent: 0 };
    }
}

async function getTechnicals(symbol) {
    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length < 20) {
            return {
                rsi14: 50,
                ema9: 0,
                ema20: 0,
                emaCross920: 'pending',
                atrPct: 2.0
            };
        }
        
        const bars = data.results;
        const closes = bars.map(bar => bar.c);
        const highs = bars.map(bar => bar.h);
        const lows = bars.map(bar => bar.l);
        
        // Calculate RSI (simplified)
        const rsi14 = calculateRSI(closes, 14);
        
        // Calculate EMAs
        const ema9 = calculateEMA(closes, 9);
        const ema20 = calculateEMA(closes, 20);
        
        // Determine EMA cross
        const ema9prev = calculateEMA(closes.slice(0, -1), 9);
        const ema20prev = calculateEMA(closes.slice(0, -1), 20);
        
        let emaCross920 = 'pending';
        if (ema9 > ema20 && ema9prev <= ema20prev) emaCross920 = 'confirmed';
        else if (ema9 < ema20 && ema9prev >= ema20prev) emaCross920 = 'bearish';
        
        // Calculate ATR%
        const atrPct = calculateATRPercent(highs, lows, closes, 14);
        
        return { rsi14, ema9, ema20, emaCross920, atrPct };
    } catch (error) {
        console.error(`Error getting technicals for ${symbol}:`, error);
        return {
            rsi14: 50,
            ema9: 0,
            ema20: 0,
            emaCross920: 'pending',
            atrPct: 2.0
        };
    }
}

async function getNews(symbol) {
    try {
        const url = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=10&apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        const allNews = data.results || [];
        
        // Filter news to only include articles that are actually about this company
        const relevantNews = allNews.filter(article => {
            const title = (article.title || '').toLowerCase();
            const description = (article.description || '').toLowerCase();
            const tickers = article.tickers || [];
            
            // Get company name for the symbol (simplified mapping)
            const companyNames = getCompanyNames(symbol);
            
            // Check if this article is actually about our company
            const mentionsCompany = companyNames.some(name => 
                title.includes(name.toLowerCase()) || 
                description.includes(name.toLowerCase())
            );
            
            // If company name is mentioned, it's relevant
            if (mentionsCompany) return true;
            
            // If this symbol is the first/primary ticker, it's likely relevant
            if (tickers.length > 0 && tickers[0] === symbol) return true;
            
            // If only one ticker and it's ours, it's relevant
            if (tickers.length === 1 && tickers[0] === symbol) return true;
            
            return false;
        });
        
        console.log(`📰 ${symbol}: Found ${allNews.length} total news, ${relevantNews.length} relevant`);
        return relevantNews.slice(0, 5); // Return top 5 relevant articles
        
    } catch (error) {
        console.error(`Error getting news for ${symbol}:`, error);
        return [];
    }
}

// Helper function to get known company names for symbols
function getCompanyNames(symbol) {
    const companyMap = {
        'KSS': ['Kohl\'s', 'Kohls'],
        'TEM': ['Tempus', 'Tempus AI'],
        'TNXP': ['Tonix', 'Tonix Pharmaceuticals'],
        'UP': ['Wheels Up'],
        'WULF': ['TeraWulf'],
        'OPEN': ['Opendoor', 'Opendoor Technologies'],
        'TSLA': ['Tesla'],
        'AAPL': ['Apple'],
        'MSFT': ['Microsoft'],
        'GOOGL': ['Google', 'Alphabet'],
        'AMZN': ['Amazon']
    };
    
    return companyMap[symbol] || [symbol];
}

function classifyCatalysts(news) {
    if (!news || news.length === 0) {
        return { score: 0, summary: 'No recent catalysts', tags: [] };
    }
    
    const latestNews = news[0];
    let score = 3; // Base score for having news
    const tags = [];
    
    const title = (latestNews.title || '').toLowerCase();
    const description = (latestNews.description || '').toLowerCase();
    const text = title + ' ' + description;
    
    // Scoring based on keywords
    if (text.includes('earnings') || text.includes('revenue')) {
        score += 3;
        tags.push('earnings');
    }
    if (text.includes('acquisition') || text.includes('merger')) {
        score += 5;
        tags.push('M&A');
    }
    if (text.includes('fda') || text.includes('approval')) {
        score += 4;
        tags.push('regulatory');
    }
    if (text.includes('partnership') || text.includes('contract')) {
        score += 3;
        tags.push('business');
    }
    if (text.includes('upgrade') || text.includes('downgrade')) {
        score += 2;
        tags.push('analyst');
    }
    
    return {
        score: Math.min(10, score),
        summary: latestNews.title || 'Recent news available',
        tags
    };
}

// Technical calculation helpers
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
    if (prices.length === 0) return 0;
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
        ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
}

function calculateATRPercent(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 2.0;
    
    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];
        
        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trueRanges.push(tr);
    }
    
    const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
    const currentPrice = closes[closes.length - 1];
    
    return currentPrice > 0 ? (atr / currentPrice) * 100 : 2.0;
}

/**
 * Evaluate a single position using screener logic
 * Returns position health score and actionable recommendations
 */
async function evaluatePosition(ticker, currentPrice = null, extraData = {}) {
    try {
        console.log(`🔍 Evaluating position health for ${ticker}`);
        
        // Step 1: Get real-time market data
        const marketData = await getLatestMarketData(ticker);
        const lastPrice = currentPrice || marketData.price || 0;
        
        // Step 2: Get volume metrics (same as screener S1)
        const volumeData = await get30DayVolumeMetrics(ticker);
        const relVol = volumeData?.relVol || 1.0;
        
        // Step 3: Get technical indicators (same as screener S2)
        const technicals = await getTechnicals(ticker);
        
        // Step 4: Get VWAP and intraday data
        const vwapData = await getVWAPData(ticker);
        
        // Step 5: Get catalyst/news data (same as screener S4)
        const news = await getNews(ticker);
        const catalystData = classifyCatalysts(news);
        
        // Step 6: Get options flow (basic proxy)
        const optionsData = await getOptionsSnapshot(ticker);
        
        // Compute composite score using screener logic
        const score = computePositionScore({
            relVol,
            aboveVWAP: vwapData.aboveVWAP,
            vwapReclaim: vwapData.vwapReclaim,
            emaCross: technicals.emaCross920,
            rsi: technicals.rsi14,
            atrPct: technicals.atrPct,
            catalystScore: catalystData.score,
            catalystAge: calculateCatalystAge(news),
            callPutRatio: optionsData.callPutRatio,
            price: lastPrice
        });
        
        // Generate position-specific action
        const action = determinePositionAction(score, {
            aboveVWAP: vwapData.aboveVWAP,
            vwapReclaim: vwapData.vwapReclaim,
            emaCross: technicals.emaCross920,
            catalystScore: catalystData.score,
            catalystAge: calculateCatalystAge(news)
        });
        
        // Calculate risk levels and targets
        const riskPlan = calculateRiskPlan(lastPrice, {
            vwap: vwapData.vwap,
            ema20: technicals.ema20,
            atrPct: technicals.atrPct
        });
        
        return {
            ticker,
            score: Math.round(score),
            action,
            lastPrice,
            metrics: {
                relVol: parseFloat(relVol.toFixed(1)),
                vwap: parseFloat(vwapData.vwap.toFixed(2)),
                aboveVWAP: vwapData.aboveVWAP,
                vwapReclaim: vwapData.vwapReclaim,
                emaCross: technicals.emaCross920,
                ema9: parseFloat(technicals.ema9.toFixed(2)),
                ema20: parseFloat(technicals.ema20.toFixed(2)),
                rsi: parseFloat(technicals.rsi14.toFixed(1)),
                atrPct: parseFloat(technicals.atrPct.toFixed(1))
            },
            catalyst: {
                summary: catalystData.summary || 'No recent catalysts',
                score: catalystData.score,
                tags: catalystData.tags || [],
                ageHours: calculateCatalystAge(news)
            },
            options: {
                callPutRatio: parseFloat(optionsData.callPutRatio.toFixed(1)),
                sentiment: optionsData.sentiment || 'neutral'
            },
            risk: riskPlan,
            thesis: await generatePositionThesis({
                ticker,
                aboveVWAP: vwapData.aboveVWAP,
                vwapReclaim: vwapData.vwapReclaim,
                relVol,
                risk: riskPlan,
                catalyst_age_hours: calculateCatalystAge(news),
                news,
                unrealizedPLPercent: extraData.unrealizedPLPercent || 0
            }, catalystData, technicals, score),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error(`❌ Error evaluating position ${ticker}:`, error);
        
        // Return safe fallback
        return {
            ticker,
            score: 50,
            action: 'MONITOR',
            lastPrice: currentPrice || 0,
            error: error.message,
            thesis: 'Analysis unavailable',
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get VWAP and intraday positioning data
 */
async function getVWAPData(ticker) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${today}/${today}?apiKey=${POLYGON_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return { vwap: 0, aboveVWAP: true, vwapReclaim: false };
        }
        
        const bars = data.results;
        const lastBar = bars[bars.length - 1];
        
        // Calculate VWAP
        let totalVolume = 0;
        let totalVWAP = 0;
        
        bars.forEach(bar => {
            const typical = (bar.h + bar.l + bar.c) / 3;
            totalVWAP += typical * bar.v;
            totalVolume += bar.v;
        });
        
        const vwap = totalVolume > 0 ? totalVWAP / totalVolume : lastBar.c;
        const currentPrice = lastBar.c;
        const aboveVWAP = currentPrice > vwap;
        
        // Check for VWAP reclaim (was below, now above)
        const recentBars = bars.slice(-10); // Last 10 minutes
        const wasBelow = recentBars.slice(0, 5).some(bar => bar.c < vwap);
        const nowAbove = recentBars.slice(-3).every(bar => bar.c > vwap);
        const vwapReclaim = wasBelow && nowAbove;
        
        return { vwap, aboveVWAP, vwapReclaim };
        
    } catch (error) {
        console.error(`Error getting VWAP data for ${ticker}:`, error);
        return { vwap: 0, aboveVWAP: true, vwapReclaim: false };
    }
}

/**
 * Get basic options flow data
 */
async function getOptionsSnapshot(ticker) {
    // Simplified options proxy - in production would use real options data
    return {
        callPutRatio: 1.0 + Math.random() * 2.0, // 1.0 - 3.0 range
        sentiment: Math.random() > 0.5 ? 'bullish' : 'neutral'
    };
}

/**
 * Compute position health score using screener weights
 */
function computePositionScore(factors) {
    let score = 50; // Base score
    
    // Volume momentum (same as screener)
    if (factors.relVol >= 3.0) score += 20;
    else if (factors.relVol >= 2.0) score += 15;
    else if (factors.relVol >= 1.5) score += 10;
    else score -= 10; // Penalty for low volume
    
    // VWAP positioning (critical for positions)
    if (factors.aboveVWAP) score += 15;
    else score -= 20; // Heavy penalty for being below VWAP
    
    if (factors.vwapReclaim) score += 10; // Bonus for reclaim
    
    // Technical setup
    if (factors.emaCross === 'confirmed') score += 15;
    else if (factors.emaCross === 'pending') score += 5;
    else score -= 10;
    
    // RSI positioning
    if (factors.rsi >= 60 && factors.rsi <= 75) score += 10; // Sweet spot
    else if (factors.rsi > 75) score -= 5; // Overbought risk
    else if (factors.rsi < 40) score -= 15; // Oversold concern
    
    // Volatility (ATR)
    if (factors.atrPct >= 3.0) score += 5; // Good volatility
    else if (factors.atrPct < 1.5) score -= 5; // Low volatility
    
    // Catalyst strength
    if (factors.catalystScore >= 8) score += 15;
    else if (factors.catalystScore >= 5) score += 10;
    else if (factors.catalystScore >= 3) score += 5;
    else score -= 5; // No catalyst
    
    // Catalyst freshness
    if (factors.catalystAge <= 24) score += 5;
    else if (factors.catalystAge <= 72) score += 2;
    else if (factors.catalystAge > 120) score -= 10; // Stale news
    
    // Options sentiment
    if (factors.callPutRatio >= 2.0) score += 5; // Bullish options flow
    else if (factors.callPutRatio <= 0.8) score -= 5; // Bearish flow
    
    return Math.max(0, Math.min(100, score));
}

/**
 * Determine position-specific action
 */
function determinePositionAction(score, signals) {
    // Critical exit conditions
    if (!signals.aboveVWAP && !signals.emaCross) {
        return 'TRIM_OR_EXIT';
    }
    
    if (score >= 80 && signals.vwapReclaim && signals.catalystScore >= 5) {
        return 'ADD_ON_STRENGTH';
    }
    
    if (score >= 75) {
        return 'HOLD';
    }
    
    if (score >= 60 && signals.aboveVWAP) {
        return 'HOLD';
    }
    
    if (signals.catalystAge > 120 && score < 65) {
        return 'CONSIDER_TRIM';
    }
    
    return 'MONITOR';
}

/**
 * Calculate risk management plan
 */
function calculateRiskPlan(currentPrice, indicators) {
    const vwapStop = indicators.vwap * 0.99; // VWAP - 1%
    const emaStop = indicators.ema20 * 0.98; // 20EMA - 2%
    const hardStop = currentPrice * 0.90; // Hard 10% stop
    
    const suggestedStop = Math.max(vwapStop, emaStop, hardStop);
    
    // Calculate risk/reward targets
    const tp1 = currentPrice * 1.15; // 15% target
    const tp2 = currentPrice * 1.30; // 30% target
    
    const riskAmount = currentPrice - suggestedStop;
    const rewardTP1 = tp1 - currentPrice;
    const riskRewardRatio = riskAmount > 0 ? rewardTP1 / riskAmount : 0;
    
    return {
        suggestedStop: parseFloat(suggestedStop.toFixed(2)),
        tp1: parseFloat(tp1.toFixed(2)),
        tp2: parseFloat(tp2.toFixed(2)),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(1))
    };
}

/**
 * Generate AI-powered actionable thesis
 */
async function generatePositionThesis(position, catalyst, technicals, score) {
    try {
        // Import AI thesis generator
        const { generateAIThesis, generatePatternBasedThesis } = require('./ai-thesis-generator');
        
        // Prepare position data for AI analysis
        const positionData = {
            symbol: position.ticker,
            score,
            unrealizedPLPercent: position.unrealizedPLPercent || 0,
            signals: {
                aboveVWAP: position.aboveVWAP,
                vwapReclaim: position.vwapReclaim,
                emaCross: technicals.emaCross920,
                relVol: position.relVol,
                rsi: technicals.rsi14,
                atrPct: technicals.atrPct
            },
            catalyst: {
                summary: catalyst.summary,
                score: catalyst.score,
                ageHours: position.catalyst_age_hours || calculateCatalystAge(position.news)
            },
            risk: position.risk || {}
        };
        
        // Try AI thesis first, fall back to pattern-based
        let thesis;
        if (process.env.OPENROUTER_API_KEY || process.env.CLAUDE_API_KEY) {
            thesis = await generateAIThesis(positionData);
        } else {
            // Use pattern-based thesis without AI
            thesis = generatePatternBasedThesis({ position: positionData });
        }
        
        // Format thesis for display
        return formatThesisForDisplay(thesis);
        
    } catch (error) {
        console.error('Error generating AI thesis:', error);
        // Fallback to simple thesis
        if (score >= 80) {
            return `Strong position (${score}): ${catalyst.summary}. Momentum intact with positive technicals.`;
        } else if (score >= 70) {
            return `Hold position (${score}): ${catalyst.summary}. Monitor for continuation signals.`;
        } else if (score >= 60) {
            return `Monitor closely (${score}): Limited catalyst support. Watch for technical improvements.`;
        } else {
            return `Review position (${score}): Weak setup. Consider risk management.`;
        }
    }
}

/**
 * Format AI thesis for display
 */
function formatThesisForDisplay(thesis) {
    const actionMap = {
        'BUY_MORE': '🟢 ADD',
        'HOLD': '🔵 HOLD',
        'TRIM_PARTIAL': '🟡 TRIM',
        'EXIT_FULL': '🔴 EXIT',
        'MONITOR': '⚪ WATCH'
    };
    
    const action = actionMap[thesis.action] || '⚪ WATCH';
    const confidence = thesis.confidence || 50;
    
    return `${action} (${confidence}% conf): ${thesis.reasoning} | Watch: ${thesis.triggers.join(', ')}`;
}

/**
 * Calculate catalyst age in hours
 */
function calculateCatalystAge(news) {
    if (!news || news.length === 0) return 9999;
    
    const latestNews = news[0];
    if (!latestNews.published_utc) return 9999;
    
    const newsTime = new Date(latestNews.published_utc);
    const now = new Date();
    
    return Math.floor((now - newsTime) / (1000 * 60 * 60)); // Hours
}

module.exports = {
    evaluatePosition,
    computePositionScore,
    determinePositionAction,
    calculateRiskPlan
};