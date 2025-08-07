/**
 * Portfolio Intelligence for Trading Dashboard
 * Enhances Recent Alerts with real-time portfolio analysis
 */

const https = require('https');

class PortfolioIntelligence {
    constructor() {
        this.alpacaConfig = {
            apiKey: 'PKX1WGCFOD3XXA9LBAR8',
            secretKey: 'vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR',
            baseUrl: 'https://paper-api.alpaca.markets'
        };
    }

    async fetchAlpacaData(endpoint) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'paper-api.alpaca.markets',
                path: endpoint,
                method: 'GET',
                headers: {
                    'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    async generatePortfolioAlerts() {
        try {
            const [positions, account] = await Promise.all([
                this.fetchAlpacaData('/v2/positions'),
                this.fetchAlpacaData('/v2/account')
            ]);

            const alerts = [];
            const currentTime = new Date().toISOString();

            // Add learning system summary
            const learningInsights = await this.getLearningSystemSummary();
            alerts.push(...learningInsights);

            // Portfolio summary alert - only if significant change
            const portfolioValue = parseFloat(account.portfolio_value || 0);
            const dayPnL = parseFloat(account.day_trade_pl || 0);
            
            // Only show portfolio alert for significant daily moves (>$500 or >0.5%)
            if (Math.abs(dayPnL) > 500 || Math.abs(dayPnL / portfolioValue) > 0.005) {
                const pnlEmoji = dayPnL > 0 ? '📈' : dayPnL < 0 ? '📉' : '➡️';
                
                alerts.push({
                    id: 'portfolio-summary',
                    type: 'PORTFOLIO',
                    severity: Math.abs(dayPnL) > 1000 ? 'HIGH' : 'MEDIUM',
                    title: `💰 Portfolio: $${portfolioValue.toLocaleString()}`,
                    message: `${pnlEmoji} Day P&L: $${dayPnL >= 0 ? '+' : ''}${dayPnL.toLocaleString()} | ${positions.length} positions`,
                    timestamp: currentTime
                });
            }

            // Analyze positions for alerts
            const bigWinners = [];
            const bigLosers = [];
            const highRisk = [];

            positions.forEach(pos => {
                const unrealizedPct = parseFloat(pos.unrealized_plpc) * 100;
                const unrealizedPnL = parseFloat(pos.unrealized_pl);
                const marketValue = parseFloat(pos.market_value);

                // Big winners (>15% gain)
                if (unrealizedPct > 15) {
                    bigWinners.push({
                        symbol: pos.symbol,
                        pct: unrealizedPct,
                        pnl: unrealizedPnL
                    });
                }

                // Big losers (>15% loss)
                if (unrealizedPct < -15) {
                    bigLosers.push({
                        symbol: pos.symbol,
                        pct: unrealizedPct,
                        pnl: unrealizedPnL
                    });
                }

                // High risk (large positions with losses)
                if (marketValue > 5000 && unrealizedPct < -10) {
                    highRisk.push({
                        symbol: pos.symbol,
                        pct: unrealizedPct,
                        pnl: unrealizedPnL,
                        value: marketValue
                    });
                }
            });

            // Winner alerts
            if (bigWinners.length > 0) {
                const topWinner = bigWinners.reduce((prev, current) => 
                    current.pct > prev.pct ? current : prev
                );
                
                alerts.push({
                    id: `winner-${topWinner.symbol}`,
                    type: 'PERFORMANCE',
                    severity: 'HIGH',
                    title: `🚀 Big Winner: ${topWinner.symbol}`,
                    message: `${topWinner.pct >= 0 ? '+' : ''}${topWinner.pct.toFixed(1)}% ($${topWinner.pnl >= 0 ? '+' : ''}${topWinner.pnl.toLocaleString()}) - Consider profit taking`,
                    symbol: topWinner.symbol,
                    timestamp: currentTime
                });
            }

            // Loser alerts
            if (bigLosers.length > 0) {
                const worstLoser = bigLosers.reduce((prev, current) => 
                    current.pct < prev.pct ? current : prev
                );
                
                alerts.push({
                    id: `loser-${worstLoser.symbol}`,
                    type: 'RISK',
                    severity: 'HIGH',
                    title: `📉 Big Loser: ${worstLoser.symbol}`,
                    message: `${worstLoser.pct.toFixed(1)}% ($${worstLoser.pnl.toLocaleString()}) - Review stop loss`,
                    symbol: worstLoser.symbol,
                    timestamp: currentTime
                });
            }

            // High risk alerts
            if (highRisk.length > 0) {
                const totalRiskValue = highRisk.reduce((sum, pos) => sum + pos.value, 0);
                
                alerts.push({
                    id: 'high-risk-positions',
                    type: 'RISK',
                    severity: 'HIGH',
                    title: `⚠️ Risk Alert: ${highRisk.length} positions`,
                    message: `$${totalRiskValue.toLocaleString()} in declining positions - Monitor closely`,
                    timestamp: currentTime
                });
            }

            // Market timing alerts
            const marketHourAlerts = this.generateMarketTimingAlerts();
            alerts.push(...marketHourAlerts);

            return alerts;

        } catch (error) {
            console.log('Portfolio intelligence error:', error.message);
            return [{
                id: 'portfolio-error',
                type: 'SYSTEM',
                severity: 'MEDIUM',
                title: '📊 Portfolio Status',
                message: 'Unable to fetch live portfolio data',
                timestamp: new Date().toISOString()
            }];
        }
    }

    generateMarketTimingAlerts() {
        const alerts = [];
        const now = new Date();
        const currentHour = now.getHours();
        const timestamp = now.toISOString();

        // Market timing alerts (EST)
        if (currentHour >= 7 && currentHour < 9) {  // Pre-market
            alerts.push({
                id: 'premarket-alert',
                type: 'STRATEGY',
                severity: 'MEDIUM',
                title: '🌅 Pre-Market Active',
                message: 'Review overnight news and VIGL discoveries',
                timestamp
            });
        } else if (currentHour >= 9 && currentHour < 10) {  // Market open
            alerts.push({
                id: 'market-open-alert',
                type: 'STRATEGY',
                severity: 'HIGH',
                title: '🔔 Market Open',
                message: 'High volatility period - Monitor position momentum',
                timestamp
            });
        } else if (currentHour >= 15 && currentHour < 16) {  // Power hour
            alerts.push({
                id: 'power-hour-alert',
                type: 'STRATEGY',
                severity: 'HIGH',
                title: '⚡ Power Hour Active',
                message: 'Final hour - High volume, watch for breakouts',
                timestamp
            });
        } else if (currentHour >= 16 && currentHour < 17) {  // After hours
            alerts.push({
                id: 'after-hours-alert',
                type: 'STRATEGY',
                severity: 'MEDIUM',
                title: '🌙 After Hours',
                message: 'Market closed - Review performance and plan tomorrow',
                timestamp
            });
        }

        return alerts;
    }

    async getLearningSystemSummary() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const logsDir = path.join(process.env.HOME, 'trading_logs', 'trading_logs');
            const alerts = [];
            const timestamp = new Date().toISOString();

            // Check for recent learning data
            const dataFiles = [
                { file: 'vigl_discoveries.json', type: 'VIGL Discoveries' },
                { file: 'portfolio_positions.json', type: 'Portfolio Snapshots' },
                { file: 'user_trades.json', type: 'Trade Decisions' },
                { file: `daily_summary_${new Date().toISOString().split('T')[0]}.json`, type: "Today's Summary" }
            ];

            let totalDataPoints = 0;
            let recentActivity = [];
            const today = new Date().toDateString();

            // Count data points and recent activity
            for (const {file, type} of dataFiles) {
                const filePath = path.join(logsDir, file);
                
                try {
                    if (fs.existsSync(filePath)) {
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        if (Array.isArray(data)) {
                            totalDataPoints += data.length;
                            
                            // Check for today's activity
                            const todayItems = data.filter(item => {
                                const itemDate = new Date(item.timestamp || item.date || Date.now()).toDateString();
                                return itemDate === today;
                            });
                            
                            if (todayItems.length > 0) {
                                recentActivity.push(`${todayItems.length} ${type.toLowerCase()}`);
                            }
                        } else if (typeof data === 'object') {
                            totalDataPoints += Object.keys(data).length;
                            
                            if (file.includes('daily_summary') && data.timestamp) {
                                const summaryDate = new Date(data.timestamp).toDateString();
                                if (summaryDate === today) {
                                    recentActivity.push(`Daily summary (${data.positions || 0} positions analyzed)`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    // File might not exist or be corrupted, skip silently
                }
            }

            // Learning system status alert
            if (totalDataPoints > 0) {
                const daysIntoExperiment = Math.floor((Date.now() - new Date('2025-08-07').getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const daysRemaining = 30 - daysIntoExperiment;
                
                alerts.push({
                    id: 'learning-system-status',
                    type: 'LEARNING',
                    severity: 'MEDIUM',
                    title: `🧠 Learning System: Day ${daysIntoExperiment}/30`,
                    message: `${totalDataPoints} data points captured | ${recentActivity.length > 0 ? 'Today: ' + recentActivity.join(', ') : 'No activity today'}`,
                    timestamp
                });

                // Progress milestone alerts
                if (daysRemaining <= 7) {
                    alerts.push({
                        id: 'experiment-deadline',
                        type: 'LEARNING',
                        severity: 'HIGH',
                        title: `⏰ Experiment Analysis: ${daysRemaining} days left`,
                        message: `Learning phase ends Sep 6 - Analysis phase begins soon`,
                        timestamp
                    });
                } else if (daysIntoExperiment % 7 === 0) {  // Weekly milestone
                    alerts.push({
                        id: 'weekly-progress',
                        type: 'LEARNING',
                        severity: 'MEDIUM',
                        title: `📈 Week ${Math.ceil(daysIntoExperiment/7)} Complete`,
                        message: `${totalDataPoints} total learning points collected`,
                        timestamp
                    });
                }
            } else {
                // No learning data found
                alerts.push({
                    id: 'learning-system-inactive',
                    type: 'LEARNING',
                    severity: 'HIGH',
                    title: `🔍 Learning System: Inactive`,
                    message: `No data collection detected - Check ~/trading_logs/`,
                    timestamp
                });
            }

            // Pattern learning insights
            try {
                const viglFile = path.join(logsDir, 'vigl_discoveries.json');
                const performanceFile = path.join(logsDir, 'vigl_performance.json');
                
                if (fs.existsSync(viglFile) && fs.existsSync(performanceFile)) {
                    const discoveries = JSON.parse(fs.readFileSync(viglFile, 'utf8'));
                    const performance = JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
                    
                    if (discoveries.length > 0 && performance.length > 0) {
                        const successful = performance.filter(p => p.outcome === 'success').length;
                        const successRate = ((successful / performance.length) * 100).toFixed(1);
                        
                        alerts.push({
                            id: 'pattern-learning',
                            type: 'LEARNING',
                            severity: 'MEDIUM',
                            title: `🎯 Pattern Success: ${successRate}%`,
                            message: `${successful}/${performance.length} VIGL patterns profitable | Target: >70%`,
                            timestamp
                        });
                    }
                }
            } catch (e) {
                // Pattern analysis not available yet
            }

            return alerts;

        } catch (error) {
            console.log('Learning system summary error:', error.message);
            return [{
                id: 'learning-error',
                type: 'LEARNING',
                severity: 'LOW',
                title: '🧠 Learning System',
                message: 'Data collection status unavailable',
                timestamp: new Date().toISOString()
            }];
        }
    }
}

module.exports = PortfolioIntelligence;