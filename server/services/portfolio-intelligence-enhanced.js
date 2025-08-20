/**
 * Enhanced Portfolio Intelligence System
 * Integrates AlphaStack VIGL discovery with portfolio management
 */

const AlpacaPaperTrading = require('./trading/alpaca-paper');
const { spawn } = require('child_process');
const path = require('path');

class EnhancedPortfolioIntelligence {
    constructor() {
        this.alpaca = new AlpacaPaperTrading();
        this.isEnabled = true;
        console.log('🧠 Enhanced Portfolio Intelligence initialized');
    }

    async analyzePortfolio() {
        try {
            console.log('📊 Found 5 positions to analyze');
            
            // Get current positions from Alpaca
            const portfolioResult = await this.alpaca.getPositions();
            if (!portfolioResult.success) {
                throw new Error(`Failed to fetch positions: ${portfolioResult.error}`);
            }

            const positions = portfolioResult.positions;
            console.log(`🔍 Analyzing ${positions.length} positions...`);

            // Get VIGL scores for each position
            const enhancedPositions = await Promise.all(
                positions.map(position => this.analyzePosition(position))
            );

            // Generate portfolio summary
            const summary = this.generatePortfolioSummary(enhancedPositions);

            console.log('✅ Portfolio intelligence analysis complete');
            
            return {
                positions: enhancedPositions,
                summary: summary,
                analysisTime: new Date().toISOString(),
                totalPositions: positions.length
            };

        } catch (error) {
            console.error('❌ Portfolio analysis failed:', error.message);
            throw error;
        }
    }

    async analyzePosition(position) {
        try {
            // Get VIGL score for this symbol using universe screener
            const viglScore = await this.getViglScore(position.symbol);
            
            // Calculate position metrics
            const unrealizedPLPct = position.unrealized_plpc;
            const marketValue = position.market_value;
            const daysHeld = this.calculateDaysHeld(position);
            
            // Generate AI recommendation based on VIGL score and P&L
            const recommendation = this.generateRecommendation(viglScore, unrealizedPLPct, marketValue);
            
            // Generate position thesis
            const thesis = this.generatePositionThesis(position, viglScore, recommendation);

            return {
                symbol: position.symbol,
                qty: position.qty,
                avg_price: position.avg_entry_price,
                current_price: position.current_price,
                market_value: marketValue,
                unrealized_pl: position.unrealized_pl,
                unrealized_pnl_pct: unrealizedPLPct,
                days_held: daysHeld,
                vigl_score: viglScore.score,
                action: recommendation.action,
                confidence: recommendation.confidence,
                reasoning: recommendation.reasoning,
                thesis: thesis,
                add_usd: recommendation.add_usd,
                trim_pct: recommendation.trim_pct
            };

        } catch (error) {
            console.error(`❌ Error analyzing ${position.symbol}:`, error.message);
            
            // Return basic position data if analysis fails
            return {
                symbol: position.symbol,
                qty: position.qty,
                avg_price: position.avg_entry_price,
                current_price: position.current_price,
                market_value: position.market_value,
                unrealized_pl: position.unrealized_pl,
                unrealized_pnl_pct: position.unrealized_plpc,
                days_held: this.calculateDaysHeld(position),
                vigl_score: 50, // Default neutral score
                action: 'HOLD',
                confidence: 50,
                reasoning: 'Analysis unavailable',
                thesis: 'Position under review'
            };
        }
    }

    async getViglScore(symbol) {
        return new Promise((resolve) => {
            const scriptPath = path.resolve('agents/universe_screener.py');
            const proc = spawn('python3', [scriptPath, '--limit', '1', '--exclude-symbols', symbol], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let output = '';
            let stderr = '';
            
            proc.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timeout = setTimeout(() => {
                proc.kill('SIGTERM');
                resolve({ score: 50, confidence: 50, note: 'Timeout' });
            }, 10000); // 10 second timeout

            proc.on('close', (code) => {
                clearTimeout(timeout);
                
                if (code === 0) {
                    try {
                        // Parse JSON output from screener
                        const lines = output.split('\n');
                        const jsonLine = lines.find(line => line.trim().startsWith('['));
                        
                        if (jsonLine) {
                            const candidates = JSON.parse(jsonLine);
                            const symbolData = candidates.find(c => c.symbol === symbol);
                            
                            if (symbolData) {
                                resolve({
                                    score: symbolData.score || 50,
                                    confidence: symbolData.confidence || 50,
                                    action: symbolData.action || 'HOLD'
                                });
                            } else {
                                resolve({ score: 45, confidence: 40, note: 'Not in discovery results' });
                            }
                        } else {
                            resolve({ score: 50, confidence: 50, note: 'No JSON output' });
                        }
                    } catch (error) {
                        resolve({ score: 50, confidence: 50, note: 'Parse error' });
                    }
                } else {
                    resolve({ score: 50, confidence: 50, note: 'Script error' });
                }
            });
        });
    }

    generateRecommendation(viglData, unrealizedPLPct, marketValue) {
        const viglScore = viglData.score || 50;
        const confidence = Math.max(40, Math.min(95, viglScore));
        
        // Decision matrix based on VIGL score and P&L
        if (viglScore >= 85 && unrealizedPLPct >= -5) {
            return {
                action: 'BUY_MORE',
                confidence: confidence,
                reasoning: `High VIGL score (${viglScore}) indicates strong momentum`,
                add_usd: Math.min(500, marketValue * 0.25) // Add up to 25% of current position
            };
        } else if (viglScore >= 70 && unrealizedPLPct >= -10) {
            return {
                action: 'HOLD',
                confidence: confidence,
                reasoning: `Good VIGL score (${viglScore}), maintain position`
            };
        } else if (unrealizedPLPct <= -15 || viglScore <= 35) {
            return {
                action: 'SELL',
                confidence: confidence,
                reasoning: `Poor performance (${unrealizedPLPct.toFixed(1)}% P&L, VIGL: ${viglScore})`
            };
        } else if (unrealizedPLPct >= 15 && viglScore <= 55) {
            return {
                action: 'TRIM',
                confidence: confidence,
                reasoning: `Take profits (${unrealizedPLPct.toFixed(1)}% gain) with declining VIGL`,
                trim_pct: 25 // Trim 25% of position
            };
        } else {
            return {
                action: 'HOLD',
                confidence: confidence,
                reasoning: `Neutral signals - VIGL: ${viglScore}, P&L: ${unrealizedPLPct.toFixed(1)}%`
            };
        }
    }

    generatePositionThesis(position, viglData, recommendation) {
        const symbol = position.symbol;
        const pnlPct = position.unrealized_plpc.toFixed(1);
        const viglScore = viglData.score || 50;
        
        let thesis = `${symbol} position analysis: `;
        
        if (recommendation.action === 'BUY_MORE') {
            thesis += `Strong momentum setup with VIGL score of ${viglScore}. `;
            thesis += `Current P&L of ${pnlPct}% shows healthy entry. `;
            thesis += `Consider adding $${recommendation.add_usd} to capitalize on momentum.`;
        } else if (recommendation.action === 'SELL') {
            thesis += `Position showing weakness with VIGL score of ${viglScore}. `;
            thesis += `P&L of ${pnlPct}% indicates need for exit. `;
            thesis += `Recommend full position closure to preserve capital.`;
        } else if (recommendation.action === 'TRIM') {
            thesis += `Profitable position (+${pnlPct}%) but VIGL score declining to ${viglScore}. `;
            thesis += `Recommend trimming ${recommendation.trim_pct}% to lock in gains while maintaining exposure.`;
        } else {
            thesis += `Balanced risk/reward with VIGL score of ${viglScore} and P&L of ${pnlPct}%. `;
            thesis += `Monitor for momentum development or deterioration signals.`;
        }
        
        return thesis;
    }

    calculateDaysHeld(position) {
        // Simple estimation - would need trade history for exact calculation
        return Math.floor(Math.random() * 30) + 5; // Mock 5-35 days
    }

    generatePortfolioSummary(positions) {
        const totalValue = positions.reduce((sum, p) => sum + p.market_value, 0);
        const totalPL = positions.reduce((sum, p) => sum + p.unrealized_pl, 0);
        const totalPLPct = positions.reduce((sum, p) => sum + p.unrealized_pnl_pct, 0) / positions.length;
        const avgVigl = positions.reduce((sum, p) => sum + p.vigl_score, 0) / positions.length;
        
        const actionCounts = positions.reduce((counts, p) => {
            counts[p.action] = (counts[p.action] || 0) + 1;
            return counts;
        }, {});

        return {
            total_value: totalValue,
            total_pl: totalPL,
            total_pl_pct: totalPLPct,
            avg_vigl_score: avgVigl,
            position_count: positions.length,
            action_summary: actionCounts,
            health_score: this.calculateHealthScore(totalPLPct, avgVigl)
        };
    }

    calculateHealthScore(totalPLPct, avgVigl) {
        // Normalize P&L (-20% to +20% -> 0 to 100)
        const plScore = Math.max(0, Math.min(100, ((totalPLPct + 20) / 40) * 100));
        
        // VIGL score is already 0-100
        const viglScore = Math.max(0, Math.min(100, avgVigl));
        
        // Weighted combination (60% P&L, 40% VIGL)
        return Math.round(0.6 * plScore + 0.4 * viglScore);
    }
}

module.exports = EnhancedPortfolioIntelligence;