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

            // Portfolio summary alert
            const portfolioValue = parseFloat(account.portfolio_value || 0);
            const dayPnL = parseFloat(account.day_trade_pl || 0);
            const buyingPower = parseFloat(account.buying_power || 0);
            
            const pnlEmoji = dayPnL > 0 ? '📈' : dayPnL < 0 ? '📉' : '➡️';
            
            alerts.push({
                id: 'portfolio-summary',
                type: 'PORTFOLIO',
                severity: Math.abs(dayPnL) > 1000 ? 'HIGH' : 'MEDIUM',
                title: `💰 Portfolio: $${portfolioValue.toLocaleString()}`,
                message: `${pnlEmoji} Day P&L: $${dayPnL >= 0 ? '+' : ''}${dayPnL.toLocaleString()} | ${positions.length} positions`,
                timestamp: currentTime
            });

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
}

module.exports = PortfolioIntelligence;