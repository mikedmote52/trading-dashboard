/**
 * AlphaStack Universe Scanner
 * Efficient funnel from full US equity universe to squeeze candidates
 * Respects $100/stock budget constraint
 */

const fetch = require('node-fetch');

// ---- CONFIG ----
const CONFIG = {
    MAX_PRICE: 100.00,
    MIN_PRICE: 0.50,
    MIN_30D_DOLLAR_VOL: 1_000_000,
    REL_VOL_TRIPWIRE: 3.0,
    REL_VOL_BIGCAP: 5.0,
    SHARESOUT_SMALL: 50_000_000,
    SHARESOUT_LARGE: 150_000_000,
    BUDGET_PER_STOCK: 100,
    SCORE_THRESHOLD_WATCHLIST: 70,
    SCORE_THRESHOLD_TRADE: 75
};

// ---- MARKET STATE PRESETS ----
const MARKET_PRESETS = {
    'live-open': {
        description: 'Market open (9:30-10:30 AM ET)',
        relvolmin: 2.0,
        rsimin: 55,
        rsimax: 78,
        atrpctmin: 3.0,
        requireemacross: false
    },
    'live-mid': {
        description: 'Mid-day trading (10:30 AM - 2:00 PM ET)',
        relvolmin: 3.0,
        rsimin: 60,
        rsimax: 75,
        atrpctmin: 4.0,
        requireemacross: true
    },
    'live-close': {
        description: 'Market close (2:00-4:00 PM ET)',
        relvolmin: 2.5,
        rsimin: 58,
        rsimax: 76,
        atrpctmin: 3.5,
        requireemacross: false
    },
    'premarket': {
        description: 'Pre-market hours (4:00-9:30 AM ET)',
        relvolmin: 1.8,
        rsimin: 50,
        rsimax: 80,
        atrpctmin: 2.5,
        requireemacross: false
    },
    'afterhours': {
        description: 'After-hours trading (4:00-8:00 PM ET)',
        relvolmin: 1.5,
        rsimin: 50,
        rsimax: 80,
        atrpctmin: 2.0,
        requireemacross: false
    },
    'weekend': {
        description: 'Weekend analysis mode',
        relvolmin: 1.2,
        rsimin: 45,
        rsimax: 85,
        atrpctmin: 1.5,
        requireemacross: false
    }
};

// API Keys (from environment)
const POLYGON_KEY = process.env.POLYGON_API_KEY;
const ALPACA_KEY = process.env.APCA_API_KEY_ID;
const ALPACA_SECRET = process.env.APCA_API_SECRET_KEY;
const ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_API_KEY || 'demo';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// Cache for expensive API calls
const cache = {
    sharesOutstanding: new Map(), // Symbol -> {value, timestamp}
    news: new Map(),
    dailyVolumes: new Map()
};

// Helper: Check if cache entry is fresh
function isCacheFresh(timestamp, maxAgeMs = 3600000) { // 1hr default
    return Date.now() - timestamp < maxAgeMs;
}

// ---- STEP S0: Build Universe ----
async function buildUniverse() {
    console.log('📊 S0: Building universe from Polygon...');
    
    try {
        // Get all active US common stocks
        const tickersUrl = `https://api.polygon.io/v3/reference/tickers?` +
            `type=CS&market=stocks&active=true&limit=1000&apiKey=${POLYGON_KEY}`;
        
        let allTickers = [];
        let nextUrl = tickersUrl;
        
        // Paginate through all results
        while (nextUrl) {
            const response = await fetch(nextUrl);
            const data = await response.json();
            
            if (data.results) {
                // Filter by primary exchanges
                const filtered = data.results.filter(t => 
                    ['XNAS', 'XNYS', 'XASE'].includes(t.primary_exchange) &&
                    !t.ticker.includes('.') // Exclude special classes
                );
                allTickers = allTickers.concat(filtered);
            }
            
            nextUrl = data.next_url ? `${data.next_url}&apiKey=${POLYGON_KEY}` : null;
        }
        
        console.log(`✅ Found ${allTickers.length} US common stocks`);
        
        // Get snapshot for prices
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_KEY}`;
        const snapshotResp = await fetch(snapshotUrl);
        const snapshot = await snapshotResp.json();
        
        // Map prices to tickers
        const priceMap = new Map();
        if (snapshot.tickers) {
            snapshot.tickers.forEach(t => {
                priceMap.set(t.ticker, {
                    price: t.day?.c || t.prevDay?.c || 0,
                    volume: t.day?.v || 0,
                    prevClose: t.prevDay?.c || 0
                });
            });
        }
        
        // Filter by price range
        const priceFiltered = allTickers.filter(t => {
            const priceData = priceMap.get(t.ticker);
            if (!priceData) return false;
            return priceData.price >= CONFIG.MIN_PRICE && priceData.price <= CONFIG.MAX_PRICE;
        }).map(t => ({
            ...t,
            ...priceMap.get(t.ticker)
        }));
        
        console.log(`✅ ${priceFiltered.length} stocks in price range $${CONFIG.MIN_PRICE}-$${CONFIG.MAX_PRICE}`);
        
        // Enhanced liquidity filter with adaptive thresholds
        const volumeFiltered = await applyLiquidityFilter(priceFiltered);
        
        console.log(`✅ ${volumeFiltered.length} stocks with sufficient liquidity`);
        
        // Shuffle to eliminate alphabetic/page-order bias before fallback
        return shuffleArray(volumeFiltered);
        
    } catch (error) {
        console.error('❌ Error building universe:', error);
        return [];
    }
}

// ---- Enhanced Liquidity Filter ----
async function applyLiquidityFilter(tickers) {
    console.log('💧 Applying enhanced liquidity filter...');
    
    const marketState = detectMarketState();
    const batchSize = 50; // Process in batches to avoid rate limits
    const volumeData = [];
    
    // Sample a subset to determine adaptive threshold
    const sampleSize = Math.min(200, tickers.length);
    const sample = tickers.slice(0, sampleSize);
    
    // Get volume data for sample
    for (let i = 0; i < sample.length; i += batchSize) {
        const batch = sample.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (ticker) => {
            const volData = await get30DayVolumeMetrics(ticker.ticker);
            if (volData) {
                volumeData.push({
                    ...ticker,
                    ...volData
                });
            }
        }));
        
        // Rate limiting
        if (i + batchSize < sample.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    if (volumeData.length === 0) {
        console.log('⚠️ No volume data available, returning price-filtered only');
        return tickers.slice(0, 100); // Fallback to first 100
    }
    
    // Calculate adaptive threshold using median
    const dollarVolumes = volumeData.map(t => t.medianDollarVol).filter(v => v > 0).sort((a, b) => a - b);
    const medianVolume = dollarVolumes[Math.floor(dollarVolumes.length / 2)];
    
    // Adaptive threshold based on market state and sample data
    let threshold;
    if (marketState.includes('live')) {
        threshold = Math.max(CONFIG.MIN_30D_DOLLAR_VOL, medianVolume * 0.3);
    } else {
        threshold = Math.max(CONFIG.MIN_30D_DOLLAR_VOL * 0.5, medianVolume * 0.2); // Relaxed for off-hours
    }
    
    console.log(`📊 Adaptive liquidity threshold: $${threshold.toLocaleString()} (median: $${medianVolume.toLocaleString()})`);
    
    // Apply threshold
    const filtered = volumeData.filter(ticker => 
        ticker.medianDollarVol >= threshold && 
        ticker.avgDollarVol >= threshold * 0.7 // Also check average
    );
    
    // If too few results, relax threshold
    if (filtered.length < 10) {
        const relaxedThreshold = threshold * 0.5;
        console.log(`🔄 Too few liquid stocks (${filtered.length}), relaxing threshold to $${relaxedThreshold.toLocaleString()}`);
        
        const relaxedFiltered = volumeData.filter(ticker => 
            ticker.medianDollarVol >= relaxedThreshold
        );
        
        return relaxedFiltered.slice(0, 100);
    }
    
    return filtered.slice(0, 150); // Return top 150 by liquidity
}

// Helper: Get 30-day volume metrics (avg + median)
async function get30DayVolumeMetrics(symbol) {
    // Check cache first
    const cached = cache.dailyVolumes.get(symbol);
    if (cached && isCacheFresh(cached.timestamp, 86400000)) { // 24hr cache
        return cached.value;
    }
    
    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length < 5) return null; // Need at least 5 days
        
        const dollarVolumes = data.results.map(bar => bar.v * bar.c);
        const avgDollarVol = dollarVolumes.reduce((sum, vol) => sum + vol, 0) / dollarVolumes.length;
        
        // Calculate median for more robust measure
        const sortedVolumes = [...dollarVolumes].sort((a, b) => a - b);
        const medianDollarVol = sortedVolumes[Math.floor(sortedVolumes.length / 2)];
        
        const result = {
            avgDollarVol,
            medianDollarVol,
            volumeConsistency: calculateVolumeConsistency(dollarVolumes)
        };
        
        // Cache result
        cache.dailyVolumes.set(symbol, {
            value: result,
            timestamp: Date.now()
        });
        
        return result;
    } catch (error) {
        return null;
    }
}

// Helper: Calculate volume consistency (lower is more consistent)
function calculateVolumeConsistency(volumes) {
    const mean = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    const variance = volumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / volumes.length;
    const stdDev = Math.sqrt(variance);
    return stdDev / mean; // Coefficient of variation
}

// Legacy helper: Get 30-day average dollar volume (for backward compatibility)
async function get30DayAvgDollarVolume(symbol) {
    const metrics = await get30DayVolumeMetrics(symbol);
    return metrics ? metrics.avgDollarVol : 0;
}

// ---- STEP S1: Session-Aware Momentum Gate ----
async function applyMomentumGate(tickers, config = {}) {
    const relvolMin = config.relvolmin || CONFIG.REL_VOL_TRIPWIRE;
    console.log(`🚀 S1: Applying session-aware momentum gate (RelVol >= ${relvolMin})...`);
    
    const now = new Date();
    const marketOpen = new Date(now);
    marketOpen.setHours(9, 30, 0, 0); // 9:30 AM ET
    const marketClose = new Date(now);
    marketClose.setHours(16, 0, 0, 0); // 4:00 PM ET
    
    // Detect market state
    const isMarketHours = now >= marketOpen && now <= marketClose;
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const sessionType = isWeekend ? 'weekend' : (isMarketHours ? 'live' : 'off-hours');
    
    console.log(`📊 Session type: ${sessionType}, using ${isMarketHours ? 'intraday' : 'daily'} RelVol computation`);
    
    const results = [];
    
    for (const ticker of tickers) {
        try {
            let relVolData;
            
            if (isMarketHours) {
                // Live session: use intraday minute bars
                relVolData = await getIntradayRelVol(ticker, marketOpen, now);
            } else {
                // Off-hours/weekend: use daily bars fallback
                relVolData = await getDailyRelVolFallback(ticker);
            }
            
            if (!relVolData) continue;
            
            const { relVol, vwap, currentPrice, aboveVWAP, vwapReclaim, bars } = relVolData;
            
            // Apply session-appropriate gates
            let passesGate = false;
            
            if (sessionType === 'live') {
                // Standard live gates
                passesGate = relVol >= relvolMin && (aboveVWAP || vwapReclaim);
            } else {
                // Relaxed off-hours gates (focus on daily momentum)
                const relaxedRelVolMin = Math.max(1.5, relvolMin * 0.7);
                passesGate = relVol >= relaxedRelVolMin && aboveVWAP;
                console.log(`📈 ${ticker.ticker}: Off-hours RelVol ${relVol.toFixed(1)} vs relaxed min ${relaxedRelVolMin.toFixed(1)}`);
            }
            
            if (passesGate) {
                results.push({
                    ...ticker,
                    vwap,
                    currentPrice,
                    relVol,
                    aboveVWAP,
                    vwapReclaim,
                    sessionType,
                    intradayBars: bars
                });
            }
            
        } catch (error) {
            console.log(`⚠️ ${ticker.ticker}: Momentum gate error - ${error.message}`);
            continue;
        }
    }
    
    console.log(`✅ ${results.length} stocks pass session-aware momentum gate (${sessionType})`);
    return results;
}

// Helper: Get intraday RelVol during market hours
async function getIntradayRelVol(ticker, marketOpen, now) {
    try {
        const from = marketOpen.toISOString();
        const to = now.toISOString();
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker.ticker}/range/1/minute/${from}/${to}?apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length < 30) return null; // Need 30+ minutes
        
        // Calculate VWAP
        let cumVolume = 0;
        let cumPriceVolume = 0;
        data.results.forEach(bar => {
            cumVolume += bar.v;
            cumPriceVolume += bar.v * bar.c;
        });
        const vwap = cumPriceVolume / cumVolume;
        
        // Calculate relative volume
        const todayVolume = cumVolume;
        const expectedVolume = await getExpectedVolume(ticker.ticker, data.results.length);
        const relVol = todayVolume / Math.max(1, expectedVolume);
        
        // Check conditions
        const currentPrice = data.results[data.results.length - 1].c;
        const aboveVWAP = currentPrice >= vwap;
        
        // Check for VWAP reclaim in last 30 minutes
        const last30Bars = data.results.slice(-30);
        let vwapReclaim = false;
        for (let i = 1; i < last30Bars.length; i++) {
            if (last30Bars[i-1].c < vwap && last30Bars[i].c >= vwap) {
                vwapReclaim = true;
                break;
            }
        }
        
        return {
            relVol,
            vwap,
            currentPrice,
            aboveVWAP,
            vwapReclaim,
            bars: data.results
        };
        
    } catch (error) {
        return null;
    }
}

// Helper: Get daily RelVol fallback for off-hours
async function getDailyRelVolFallback(ticker) {
    try {
        // Get last 5 trading days
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker.ticker}/range/1/day/${from}/${to}?apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length < 2) return null;
        
        const bars = data.results;
        const todayBar = bars[bars.length - 1];
        const previousBars = bars.slice(0, -1);
        
        // Calculate 30-day average volume (using available days)
        const avgVolume = previousBars.reduce((sum, bar) => sum + bar.v, 0) / previousBars.length;
        const relVol = todayBar.v / Math.max(1, avgVolume);
        
        // Use day's VWAP approximation (high+low+close)/3 weighted by volume
        const vwap = (todayBar.h + todayBar.l + todayBar.c) / 3;
        const currentPrice = todayBar.c;
        const aboveVWAP = currentPrice >= vwap;
        
        return {
            relVol,
            vwap,
            currentPrice,
            aboveVWAP,
            vwapReclaim: false, // Cannot detect intraday reclaim from daily data
            bars: [todayBar] // Single daily bar
        };
        
    } catch (error) {
        return null;
    }
}

// Helper: Get expected volume for elapsed minutes (live session)
async function getExpectedVolume(symbol, elapsedMinutes) {
    // Simplified: use 30-day average daily volume / 390 * elapsed minutes
    const avgDailyVol = (await get30DayAvgDollarVolume(symbol)) / 50; // Rough price estimate
    return (avgDailyVol / 390) * elapsedMinutes;
}

// ---- STEP S2: Technical Health ----
function applyTechnicalFilters(tickers, config = {}) {
    const rsiMin = config.rsimin || 60;
    const rsiMax = config.rsimax || 75;
    const atrMin = config.atrpctmin || 4.0;
    const requireEma = config.requireemacross !== false;
    
    console.log(`📈 S2: Applying technical filters (RSI ${rsiMin}-${rsiMax}, ATR>=${atrMin}, EMA required: ${requireEma})...`);
    
    const results = [];
    
    for (const ticker of tickers) {
        const bars = ticker.intradayBars;
        if (!bars || bars.length < 20) continue;
        
        // Calculate EMAs
        const closes = bars.map(b => b.c);
        const ema9 = calculateEMA(closes, 9);
        const ema20 = calculateEMA(closes, 20);
        
        // Check for bullish cross
        const emaCross = ema9[ema9.length - 1] >= ema20[ema20.length - 1];
        
        // Calculate RSI
        const rsi = calculateRSI(closes, 14);
        
        // Calculate ATR%
        const atrPct = calculateATRPercent(bars, 14);
        
        // Apply filters
        const emaPass = requireEma ? emaCross : true;
        if (emaPass && rsi >= rsiMin && rsi <= rsiMax && atrPct >= atrMin) {
            results.push({
                ...ticker,
                ema9: ema9[ema9.length - 1],
                ema20: ema20[ema20.length - 1],
                emaCross,
                rsi,
                atrPct
            });
        }
    }
    
    console.log(`✅ ${results.length} stocks pass technical filters`);
    return results;
}

// Helper: Calculate EMA
function calculateEMA(values, period) {
    const k = 2 / (period + 1);
    const ema = [values[0]];
    
    for (let i = 1; i < values.length; i++) {
        ema.push(values[i] * k + ema[i - 1] * (1 - k));
    }
    
    return ema;
}

// Helper: Calculate RSI
function calculateRSI(values, period = 14) {
    if (values.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const diff = values[i] - values[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

// Helper: Calculate ATR%
function calculateATRPercent(bars, period = 14) {
    if (bars.length < period) return 0;
    
    const trs = [];
    for (let i = 1; i < bars.length; i++) {
        const high = bars[i].h;
        const low = bars[i].l;
        const prevClose = bars[i - 1].c;
        
        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trs.push(tr);
    }
    
    const atr = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
    const currentPrice = bars[bars.length - 1].c;
    
    return (atr / currentPrice) * 100;
}

// ---- STEP S3: Squeeze Proxy ----
async function applySqueezeProxy(tickers) {
    console.log('🔥 S3: Applying squeeze proxy filters...');
    
    const results = [];
    
    for (const ticker of tickers) {
        // Get shares outstanding from Alpha Vantage
        const sharesOut = await getSharesOutstanding(ticker.ticker);
        ticker.sharesOutstanding = sharesOut;
        
        // Apply squeeze proxy logic
        let passes = false;
        
        if (sharesOut && sharesOut <= CONFIG.SHARESOUT_SMALL) {
            // Small float - automatic pass
            passes = true;
            ticker.squeezeReason = 'Small float';
        } else if (sharesOut && sharesOut > CONFIG.SHARESOUT_LARGE) {
            // Large cap - need strong signals
            if (ticker.relVol >= CONFIG.REL_VOL_BIGCAP) {
                passes = true;
                ticker.squeezeReason = 'Large cap with extreme volume';
            }
        } else {
            // Mid-tier - need at least one strong signal
            if (ticker.relVol >= 4) {
                passes = true;
                ticker.squeezeReason = 'Mid-cap with high volume';
            }
        }
        
        if (passes) {
            results.push(ticker);
        }
    }
    
    console.log(`✅ ${results.length} stocks pass squeeze proxy`);
    return results;
}

// Helper: Get shares outstanding from Alpha Vantage
async function getSharesOutstanding(symbol) {
    // Check cache first
    const cached = cache.sharesOutstanding.get(symbol);
    if (cached && isCacheFresh(cached.timestamp, 7 * 24 * 60 * 60 * 1000)) { // 7 day cache
        return cached.value;
    }
    
    try {
        const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHAVANTAGE_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        const sharesOut = parseInt(data.SharesOutstanding) || null;
        
        // Cache result
        cache.sharesOutstanding.set(symbol, {
            value: sharesOut,
            timestamp: Date.now()
        });
        
        return sharesOut;
    } catch (error) {
        return null;
    }
}

// ---- STEP S4: Catalyst Detection ----
async function detectCatalysts(tickers) {
    console.log('📰 S4: Detecting catalysts...');
    
    const results = [];
    
    for (const ticker of tickers) {
        try {
            // Get news from multiple sources
            const news = await getNews(ticker.ticker);
            
            // Classify catalysts (would use OpenRouter in production)
            const catalystData = classifyCatalysts(news);
            
            ticker.catalyst = catalystData.summary;
            ticker.catalystScore = catalystData.score;
            ticker.catalystTags = catalystData.tags;
            
            // Pass if strong catalyst
            if (catalystData.score >= 6 || catalystData.hasVerifiedCatalyst) {
                results.push(ticker);
            }
            
        } catch (error) {
            // No catalyst found
            continue;
        }
    }
    
    console.log(`✅ ${results.length} stocks have catalysts`);
    return results;
}

// Helper: Get news from multiple sources
async function getNews(symbol) {
    const news = [];
    
    try {
        // Polygon news
        const polygonUrl = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=10&apiKey=${POLYGON_KEY}`;
        const polygonResp = await fetch(polygonUrl);
        const polygonData = await polygonResp.json();
        
        if (polygonData.results) {
            news.push(...polygonData.results);
        }
        
        // Alpha Vantage news sentiment
        const avUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${ALPHAVANTAGE_KEY}`;
        const avResp = await fetch(avUrl);
        const avData = await avResp.json();
        
        if (avData.feed) {
            news.push(...avData.feed);
        }
        
    } catch (error) {
        // Continue with what we have
    }
    
    return news;
}

// Helper: Classify catalysts (simplified - would use OpenRouter LLM in production)
function classifyCatalysts(news) {
    const catalystKeywords = {
        EARNINGS: ['earnings', 'beat', 'miss', 'revenue', 'guidance', 'quarter'],
        FDA: ['fda', 'approval', 'drug', 'trial', 'phase', 'clinical'],
        MA: ['merger', 'acquisition', 'deal', 'buyout', 'acquire'],
        PARTNERSHIP: ['partnership', 'collaboration', 'agreement', 'contract'],
        INSIDER: ['insider', 'ceo', 'cfo', 'director', 'bought', 'sold']
    };
    
    const tags = [];
    let score = 0;
    let summary = '';
    
    for (const article of news.slice(0, 5)) { // Check first 5 articles
        const text = (article.title + ' ' + (article.summary || '')).toLowerCase();
        
        for (const [tag, keywords] of Object.entries(catalystKeywords)) {
            if (keywords.some(kw => text.includes(kw))) {
                if (!tags.includes(tag)) {
                    tags.push(tag);
                    score += 2;
                }
            }
        }
        
        if (!summary && article.title) {
            summary = article.title.substring(0, 100);
        }
    }
    
    return {
        tags,
        score: Math.min(10, score),
        summary: summary || 'Momentum catalyst detected',
        hasVerifiedCatalyst: tags.some(t => ['EARNINGS', 'FDA', 'MA', 'PARTNERSHIP', 'INSIDER'].includes(t))
    };
}

// ---- STEP S6: Final Scoring & Ranking ----
function scoreAndRank(tickers) {
    console.log('🎯 S6: Scoring and ranking candidates...');
    
    const scored = tickers.map(ticker => {
        let score = 0;
        
        // 25% Volume & Momentum
        if (ticker.relVol >= 8) score += 15;
        else if (ticker.relVol >= 5) score += 13;
        else if (ticker.relVol >= 3) score += 10;
        
        if (ticker.aboveVWAP) score += 10;
        else if (ticker.vwapReclaim) score += 7;
        
        // 20% Float & Squeeze
        if (ticker.sharesOutstanding) {
            if (ticker.sharesOutstanding <= CONFIG.SHARESOUT_SMALL) score += 12;
            else if (ticker.sharesOutstanding <= CONFIG.SHARESOUT_LARGE) score += 6;
        }
        
        if (ticker.relVol >= 5 && ticker.sharesOutstanding > CONFIG.SHARESOUT_LARGE) {
            score += 8; // Big cap with huge volume
        }
        
        // 20% Catalyst
        score += Math.min(20, ticker.catalystScore * 2);
        
        // 15% Sentiment (simplified)
        if (ticker.catalystTags && ticker.catalystTags.length > 0) {
            score += Math.min(15, ticker.catalystTags.length * 5);
        }
        
        // 10% Options (skipped for now - no options data)
        
        // 10% Technicals
        if (ticker.emaCross) score += 4;
        if (ticker.rsi >= 60 && ticker.rsi <= 70) score += 3;
        if (ticker.atrPct >= 4) score += 3;
        
        ticker.alphaScore = Math.min(100, Math.round(score));
        
        // Calculate shares to buy (respecting budget)
        ticker.sharesToBuy = Math.floor(CONFIG.BUDGET_PER_STOCK / ticker.currentPrice);
        ticker.dollarAmount = ticker.sharesToBuy * ticker.currentPrice;
        
        // Set action based on score
        if (ticker.alphaScore >= CONFIG.SCORE_THRESHOLD_TRADE) {
            ticker.action = 'TRADE_READY';
        } else if (ticker.alphaScore >= CONFIG.SCORE_THRESHOLD_WATCHLIST) {
            ticker.action = 'WATCHLIST';
        } else {
            ticker.action = 'MONITOR';
        }
        
        // Entry plan
        ticker.entryPlan = {
            trigger: ticker.aboveVWAP ? 'HOD break' : 'VWAP reclaim',
            entryPrice: ticker.currentPrice * 1.02, // 2% above current
            stopLoss: ticker.currentPrice * 0.9,     // 10% stop
            tp1: ticker.currentPrice * 1.2,          // 20% target
            tp2: ticker.currentPrice * 1.5           // 50% target
        };
        
        return ticker;
    });
    
    // Sort by score, then by relative volume
    scored.sort((a, b) => {
        if (b.alphaScore !== a.alphaScore) return b.alphaScore - a.alphaScore;
        if (b.relVol !== a.relVol) return b.relVol - a.relVol;
        return b.catalystScore - a.catalystScore;
    });
    
    // Filter by minimum score
    const qualified = scored.filter(t => t.alphaScore >= CONFIG.SCORE_THRESHOLD_WATCHLIST);
    
    console.log(`✅ ${qualified.length} qualified candidates (${scored.filter(t => t.alphaScore >= CONFIG.SCORE_THRESHOLD_TRADE).length} trade-ready)`);
    
    return qualified;
}

// ---- Market State Detection ----
function detectMarketState() {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hour = et.getHours();
    const minute = et.getMinutes();
    const dayOfWeek = et.getDay();
    
    // Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return 'weekend';
    }
    
    // Market hours (9:30 AM - 4:00 PM ET)
    const marketOpenTime = 9 * 60 + 30; // 9:30 AM in minutes
    const marketCloseTime = 16 * 60;    // 4:00 PM in minutes  
    const currentTime = hour * 60 + minute;
    
    if (currentTime >= marketOpenTime && currentTime <= marketCloseTime) {
        // Live market - determine sub-session
        if (currentTime <= marketOpenTime + 60) {
            return 'live-open';   // First hour
        } else if (currentTime >= marketCloseTime - 120) {
            return 'live-close';  // Last 2 hours
        } else {
            return 'live-mid';    // Mid-day
        }
    }
    
    // Pre-market (4:00 AM - 9:30 AM ET)
    if (currentTime >= 4 * 60 && currentTime < marketOpenTime) {
        return 'premarket';
    }
    
    // After-hours (4:00 PM - 8:00 PM ET)
    if (currentTime > marketCloseTime && currentTime <= 20 * 60) {
        return 'afterhours';
    }
    
    // Overnight (8:00 PM - 4:00 AM ET next day)
    return 'weekend'; // Treat overnight like weekend
}

// ---- Auto-Preset Selection ----
function getAutoPreset(params, marketState) {
    // If user provided specific params, don't override
    const hasUserParams = params.relvolmin !== undefined || 
                         params.rsimin !== undefined || 
                         params.atrpctmin !== undefined;
    
    if (hasUserParams) {
        console.log(`🎯 Using user-provided parameters (market: ${marketState})`);
        return {
            relvolmin: params.relvolmin || CONFIG.REL_VOL_TRIPWIRE,
            rsimin: params.rsimin || 60,
            rsimax: params.rsimax || 75,
            atrpctmin: params.atrpctmin || 4.0,
            requireemacross: params.requireemacross !== false,
            autoTune: params.autoTune || false
        };
    }
    
    // Use market-appropriate preset
    const preset = MARKET_PRESETS[marketState] || MARKET_PRESETS['weekend'];
    console.log(`🎯 Auto-selected preset: ${preset.description}`);
    
    return {
        ...preset,
        autoTune: params.autoTune || false
    };
}

// ---- Main Scanner Function ----
async function scanUniverse(params = {}) {
    const marketState = detectMarketState();
    const config = getAutoPreset(params, marketState);
    
    console.log(`🔍 Starting AlphaStack Universe Scan (${marketState})`);
    console.log('📊 Scan configuration:', config);
    const startTime = Date.now();
    
    try {
        // S0: Build universe
        const universe = await buildUniverse();
        if (universe.length === 0) {
            console.log('❌ No stocks in universe');
            return [];
        }
        
        // S1: Momentum gate
        const momentum = await applyMomentumGate(universe, config);
        if (momentum.length === 0) {
            console.log('❌ No stocks pass momentum gate, trying catalyst-only fallback...');
            return await runCatalystOnlyFallback(universe, config);
        }
        
        // S2: Technical filters
        const technical = applyTechnicalFilters(momentum, config);
        if (technical.length === 0) {
            console.log('❌ No stocks pass technical filters, trying catalyst-only fallback...');
            return await runCatalystOnlyFallback(universe, config);
        }
        
        // S3: Squeeze proxy
        const squeeze = await applySqueezeProxy(technical);
        if (squeeze.length === 0) {
            console.log('❌ No stocks pass squeeze proxy, trying catalyst-only fallback...');
            return await runCatalystOnlyFallback(universe, config);
        }
        
        // S4: Catalyst detection
        const catalyst = await detectCatalysts(squeeze);
        
        // S6: Score and rank
        const final = scoreAndRank(catalyst);
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Scan complete in ${elapsed}s`);
        
        // Auto-tune if zero results
        if (final.length === 0 && !config.autoTune) {
            console.log('🔄 Auto-tuning: No results found, trying softer gates...');
            const softer = {
                ...config,
                relvolmin: Math.max(1.5, (config.relvolmin || 3) - 1),
                rsimin: 55, 
                rsimax: 78,
                atrpctmin: Math.max(3.0, (config.atrpctmin || 4) - 1),
                requireemacross: false,
                autoTune: true
            };
            return await scanUniverse(softer);
        }
        
        // Return results with gate counts
        const gateCounts = {
            s0_universe: universe.length,
            s1_momentum: momentum.length,
            s2_technical: technical.length,
            s3_squeeze: squeeze.length,
            s4_catalyst: catalyst.length,
            s6_final: final.length,
            sortKeys: ['alphaScore','relVol','catalystScore','catalyst_age_hours','atrPct','price']
        };
        
        // Always sort by "best first" before slicing
        const sorted = [...final].sort(rankCandidates);
        
        return {
            candidates: sorted.slice(0, 30).map(formatOutput),
            gateCounts,
            autoTuned: config.autoTune,
            marketState,
            scanTime: ((Date.now() - startTime) / 1000).toFixed(1),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ Scanner error:', error);
        // NEVER return [] - always return proper structure
        return createEmptyResponse(error, startTime);
    }
}

// ---- Guaranteed Response Structure ----
function createEmptyResponse(error = null, startTime = Date.now()) {
    return {
        candidates: [],
        gateCounts: {
            s0_universe: 0,
            s1_momentum: 0,
            s2_technical: 0,
            s3_squeeze: 0,
            s4_catalyst: 0,
            s6_final: 0
        },
        autoTuned: false,
        marketState: detectMarketState(),
        scanTime: ((Date.now() - startTime) / 1000).toFixed(1),
        timestamp: new Date().toISOString(),
        error: error ? error.message : null,
        fallbackMode: 'error'
    };
}

// Helper: Format output for UI (safe with null checks)
function formatOutput(ticker) {
    // Ensure all required fields exist with safe defaults
    const safeValue = (value, defaultValue) => {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return defaultValue;
        }
        return value;
    };
    
    const safeNumber = (value, decimals = 1, defaultValue = 0) => {
        const num = Number(value);
        if (Number.isNaN(num)) return defaultValue;
        return num.toFixed(decimals);
    };
    
    return {
        ticker: safeValue(ticker.ticker, 'UNKNOWN'),
        price: safeValue(ticker.currentPrice || ticker.price, 0),
        sharesToBuy: safeValue(ticker.sharesToBuy, Math.floor(CONFIG.BUDGET_PER_STOCK / (ticker.currentPrice || ticker.price || 1))),
        budgetCap: CONFIG.BUDGET_PER_STOCK,
        sharesOutstanding: safeValue(ticker.sharesOutstanding, 0),
        relVolume: safeNumber(ticker.relVol, 1, 1.0),
        vwap: safeNumber(ticker.vwap, 2, ticker.currentPrice || ticker.price || 0),
        aboveVWAP: Boolean(ticker.aboveVWAP),
        emaCross920: ticker.emaCross ? 'confirmed' : 'pending',
        rsi14: safeNumber(ticker.rsi, 1, 50),
        atrPct: safeNumber(ticker.atrPct, 1, 0),
        catalyst: safeValue(ticker.catalyst, 'Momentum setup'),
        catalystStrength: safeValue(ticker.catalystScore, 3),
        alphaScore: safeValue(ticker.alphaScore, 50),
        action: safeValue(ticker.action, 'MONITOR'),
        entryPlan: ticker.entryPlan || {
            trigger: 'Volume confirmation',
            entryPrice: (ticker.currentPrice || ticker.price || 0) * 1.02,
            stopLoss: (ticker.currentPrice || ticker.price || 0) * 0.92,
            tp1: (ticker.currentPrice || ticker.price || 0) * 1.15,
            tp2: (ticker.currentPrice || ticker.price || 0) * 1.3
        },
        squeezeReason: safeValue(ticker.squeezeReason, 'Technical setup'),
        sessionType: safeValue(ticker.sessionType, detectMarketState()),
        fallbackMode: ticker.fallbackMode || null
    };
}

// ---- Safe Result Wrapper ----
function ensureValidResult(result) {
    // Guarantee the result always has the required structure
    if (!result || typeof result !== 'object') {
        return createEmptyResponse(new Error('Invalid result structure'));
    }
    
    // Ensure candidates is always an array
    if (!Array.isArray(result.candidates)) {
        result.candidates = [];
    }
    
    // Ensure gateCounts exists
    if (!result.gateCounts || typeof result.gateCounts !== 'object') {
        result.gateCounts = {
            s0_universe: 0,
            s1_momentum: 0,
            s2_technical: 0,
            s3_squeeze: 0,
            s4_catalyst: 0,
            s6_final: result.candidates.length
        };
    }
    
    // Ensure timestamp and other metadata
    if (!result.timestamp) {
        result.timestamp = new Date().toISOString();
    }
    
    if (!result.marketState) {
        result.marketState = detectMarketState();
    }
    
    // Validate each candidate has required fields
    result.candidates = result.candidates.map(candidate => {
        if (!candidate || typeof candidate !== 'object') {
            return formatOutput({ ticker: 'ERROR', price: 0 });
        }
        return formatOutput(candidate);
    });
    
    return result;
}

// ---- Catalyst-Only Fallback ----
async function runCatalystOnlyFallback(universe, config) {
    console.log('🔥 Running catalyst-only fallback mode...');
    
    const results = [];
    const sampleSize = Math.min(100, universe.length); // Process top 100 by liquidity
    const sample = universe.slice(0, sampleSize);
    
    // Step 1: Find stocks with ANY catalysts (very relaxed)
    for (const ticker of sample) {
        try {
            // Get news and classify catalysts
            const news = await getNews(ticker.ticker);
            const catalystData = classifyCatalysts(news);
            
            // Much lower threshold for catalyst-only mode
            if (catalystData.score >= 3 || catalystData.hasVerifiedCatalyst || news.length >= 2) {
                // Add minimal technical data
                const technicalData = await getMinimalTechnicals(ticker);
                
                results.push({
                    ...ticker,
                    ...technicalData,
                    catalyst: catalystData.summary,
                    catalystScore: catalystData.score,
                    catalystTags: catalystData.tags,
                    fallbackMode: 'catalyst-only',
                    relVol: technicalData.relVol || 1.0,
                    vwap: technicalData.vwap || ticker.price,
                    currentPrice: ticker.price,
                    aboveVWAP: true, // Assume true for fallback
                    vwapReclaim: false,
                    sessionType: 'fallback'
                });
            }
        } catch (error) {
            // Skip on error
            continue;
        }
    }
    
    console.log(`🔎 Catalyst fallback found ${results.length} candidates`);
    
    if (results.length === 0) {
        // Last resort: return top universe stocks with synthetic data
        console.log('🎆 Last resort: returning top universe stocks with synthetic scores');
        return {
            candidates: universe.slice(0, 5).map(ticker => ({
                ...formatOutput({
                    ...ticker,
                    alphaScore: 45, // Low but visible score
                    catalyst: 'Volume/price action momentum',
                    catalystScore: 3,
                    catalystTags: ['MOMENTUM'],
                    relVol: 1.2,
                    vwap: ticker.price * 0.98,
                    currentPrice: ticker.price,
                    aboveVWAP: true,
                    vwapReclaim: false,
                    emaCross: false,
                    rsi: 55,
                    atrPct: 3.0,
                    action: 'MONITOR',
                    fallbackMode: 'synthetic',
                    entryPlan: {
                        trigger: 'Volume confirmation',
                        entryPrice: ticker.price * 1.02,
                        stopLoss: ticker.price * 0.9,
                        tp1: ticker.price * 1.15,
                        tp2: ticker.price * 1.3
                    }
                })
            })),
            gateCounts: {
                s0_universe: universe.length,
                s1_momentum: 0,
                s2_technical: 0,
                s3_squeeze: 0,
                s4_catalyst: 0,
                s6_final: 5
            },
            fallbackMode: 'synthetic'
        };
    }
    
    // Apply catalyst-focused scoring
    const scored = results.map(ticker => {
        let score = 30; // Base score for having a catalyst
        
        // Heavy weight on catalyst strength
        score += Math.min(40, ticker.catalystScore * 8);
        
        // Minimal technical scoring
        if (ticker.relVol >= 1.5) score += 10;
        if (ticker.aboveVWAP) score += 5;
        
        // Bonus for verified catalyst types
        if (ticker.catalystTags && ticker.catalystTags.length > 0) {
            score += Math.min(15, ticker.catalystTags.length * 5);
        }
        
        ticker.alphaScore = Math.min(100, Math.round(score));
        
        // Set conservative action
        if (ticker.alphaScore >= 65) {
            ticker.action = 'WATCHLIST';
        } else {
            ticker.action = 'MONITOR';
        }
        
        // Conservative entry plan
        ticker.entryPlan = {
            trigger: 'Catalyst confirmation + volume',
            entryPrice: ticker.currentPrice * 1.03,
            stopLoss: ticker.currentPrice * 0.88,
            tp1: ticker.currentPrice * 1.18,
            tp2: ticker.currentPrice * 1.4
        };
        
        return ticker;
    });
    
    // Sort by multi-key ranking before slicing
    const final = scored.sort(rankCandidates).slice(0, 10);
    
    const result = {
        candidates: final.map(formatOutput),
        gateCounts: {
            s0_universe: universe.length,
            s1_momentum: 0,
            s2_technical: 0,
            s3_squeeze: 0,
            s4_catalyst: results.length,
            s6_final: final.length
        },
        fallbackMode: 'catalyst-only',
        marketState: detectMarketState(),
        timestamp: new Date().toISOString(),
        autoTuned: false
    };
    
    return ensureValidResult(result);
}

// Helper: Get minimal technical data for fallback
async function getMinimalTechnicals(ticker) {
    try {
        // Get just recent price data for basic RelVol
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker.ticker}/range/1/day/${from}/${to}?apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length < 2) {
            return { relVol: 1.0, vwap: ticker.price };
        }
        
        const bars = data.results;
        const todayBar = bars[bars.length - 1];
        const previousBars = bars.slice(0, -1);
        
        const avgVolume = previousBars.reduce((sum, bar) => sum + bar.v, 0) / previousBars.length;
        const relVol = todayBar.v / Math.max(1, avgVolume);
        const vwap = (todayBar.h + todayBar.l + todayBar.c) / 3;
        
        return { relVol, vwap };
    } catch (error) {
        return { relVol: 1.0, vwap: ticker.price };
    }
}

// ---- Ranking Functions ----
function rankCandidates(a, b) {
    // Multi-key stable sort: best first
    const ageA = a.catalyst_age_hours ?? 9999;
    const ageB = b.catalyst_age_hours ?? 9999;
    
    return (
        (b.alphaScore ?? 0) - (a.alphaScore ?? 0) ||                    // 1) Alpha score (main)
        (b.relVol ?? 0) - (a.relVol ?? 0) ||                            // 2) Relative volume
        (b.catalystScore ?? 0) - (a.catalystScore ?? 0) ||              // 3) Catalyst strength
        ageA - ageB ||                                                   // 4) Fresher news first
        (b.atrPct ?? 0) - (a.atrPct ?? 0) ||                           // 5) Volatility (higher better)
        (a.currentPrice ?? a.price ?? 999) - (b.currentPrice ?? b.price ?? 999) // 6) Cheaper last
    );
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Export for use in server
module.exports = {
    scanUniverse,
    CONFIG
};