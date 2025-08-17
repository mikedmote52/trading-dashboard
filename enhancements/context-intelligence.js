/**
 * Context Intelligence Enhancement
 * Adds sophisticated market context analysis without modifying core systems
 * SAFETY: Pure additive enhancement - no existing code modified
 */

class ContextIntelligence {
    constructor() {
        this.marketSessions = {
            premarket: { start: 4, end: 9.5 },
            regular: { start: 9.5, end: 16 },
            afterhours: { start: 16, end: 20 }
        };
        this.contextCache = new Map();
    }

    /**
     * Enriches discovery data with intelligent market context
     * @param {Array} discoveries - Raw VIGL discoveries 
     * @param {Object} portfolio - Current portfolio state
     * @returns {Array} Context-enriched discoveries
     */
    enrichDiscoveries(discoveries, portfolio) {
        const marketContext = this.getMarketContext();
        const portfolioContext = this.getPortfolioContext(portfolio);
        
        return discoveries.map(discovery => ({
            ...discovery,
            context: {
                market: marketContext,
                portfolio: portfolioContext,
                timing: this.getTimingContext(discovery),
                risk: this.getRiskContext(discovery, portfolio),
                opportunity: this.getOpportunityContext(discovery, marketContext)
            }
        }));
    }

    getMarketContext() {
        const now = new Date();
        const hour = now.getHours() + (now.getMinutes() / 60);
        
        let session = 'closed';
        let sessionPhase = 'off-hours';
        
        if (hour >= this.marketSessions.premarket.start && hour < this.marketSessions.premarket.end) {
            session = 'premarket';
            sessionPhase = hour < 7 ? 'early-premarket' : 'late-premarket';
        } else if (hour >= this.marketSessions.regular.start && hour < this.marketSessions.regular.end) {
            session = 'regular';
            if (hour < 10.5) sessionPhase = 'market-open';
            else if (hour > 15) sessionPhase = 'power-hour';
            else sessionPhase = 'mid-day';
        } else if (hour >= this.marketSessions.afterhours.start && hour < this.marketSessions.afterhours.end) {
            session = 'afterhours';
            sessionPhase = 'after-hours';
        }

        return {
            session,
            sessionPhase,
            optimalTiming: this.isOptimalTiming(session, sessionPhase),
            volatilityLevel: this.getVolatilityLevel(session, sessionPhase),
            liquidityLevel: this.getLiquidityLevel(session, sessionPhase)
        };
    }

    getPortfolioContext(portfolio) {
        const positions = portfolio.positions || [];
        const totalValue = portfolio.totalValue || 0;
        const dailyPnL = portfolio.dailyPnL || 0;
        
        // Calculate portfolio concentration risk
        const topPositions = positions
            .sort((a, b) => b.marketValue - a.marketValue)
            .slice(0, 3);
        const topPositionsValue = topPositions.reduce((sum, pos) => sum + pos.marketValue, 0);
        const concentration = totalValue > 0 ? topPositionsValue / totalValue : 0;

        // Calculate portfolio momentum
        const momentum = positions.length > 0 
            ? positions.reduce((sum, pos) => sum + pos.unrealizedPnLPercent, 0) / positions.length
            : 0;

        return {
            positionCount: positions.length,
            concentration,
            momentum,
            riskCapacity: this.calculateRiskCapacity(totalValue, dailyPnL, concentration),
            diversification: this.calculateDiversification(positions),
            cashPosition: this.estimateCashPosition(totalValue, positions)
        };
    }

    getTimingContext(discovery) {
        const discoveryAge = discovery.discoveredAt 
            ? (Date.now() - new Date(discovery.discoveredAt).getTime()) / (1000 * 60 * 60)
            : 0;

        return {
            age: discoveryAge,
            freshness: discoveryAge < 1 ? 'fresh' : discoveryAge < 6 ? 'recent' : 'stale',
            urgency: this.calculateUrgency(discovery, discoveryAge),
            optimalEntry: this.getOptimalEntryTiming(discovery)
        };
    }

    getRiskContext(discovery, portfolio) {
        const baseRisk = discovery.riskLevel || 'MODERATE';
        const portfolioRisk = this.assessPortfolioRisk(portfolio);
        const correlationRisk = this.assessCorrelationRisk(discovery, portfolio);
        
        return {
            individual: baseRisk,
            portfolio: portfolioRisk,
            correlation: correlationRisk,
            combined: this.combineRiskFactors(baseRisk, portfolioRisk, correlationRisk),
            mitigation: this.suggestRiskMitigation(discovery, portfolio)
        };
    }

    getOpportunityContext(discovery, marketContext) {
        const baseOpportunity = discovery.confidence || 0;
        const timingMultiplier = this.getTimingMultiplier(marketContext);
        const momentumBoost = this.getMomentumBoost(discovery);
        
        return {
            base: baseOpportunity,
            timing: timingMultiplier,
            momentum: momentumBoost,
            enhanced: Math.min(baseOpportunity * timingMultiplier * momentumBoost, 1.0),
            reasoning: this.generateOpportunityReasoning(discovery, marketContext)
        };
    }

    // Helper methods for context calculations
    isOptimalTiming(session, phase) {
        // VIGL patterns often work best during high-volume periods
        return session === 'regular' && (phase === 'market-open' || phase === 'power-hour');
    }

    getVolatilityLevel(session, phase) {
        if (session === 'regular') {
            if (phase === 'market-open' || phase === 'power-hour') return 'high';
            return 'moderate';
        }
        return session === 'premarket' ? 'moderate' : 'low';
    }

    getLiquidityLevel(session, phase) {
        if (session === 'regular') return phase === 'mid-day' ? 'high' : 'moderate';
        return 'low';
    }

    calculateRiskCapacity(totalValue, dailyPnL, concentration) {
        // Conservative risk capacity based on portfolio health
        let capacity = 'moderate';
        
        if (totalValue < 10000 || dailyPnL < -1000 || concentration > 0.5) {
            capacity = 'low';
        } else if (totalValue > 50000 && dailyPnL > 0 && concentration < 0.3) {
            capacity = 'high';
        }
        
        return capacity;
    }

    calculateDiversification(positions) {
        if (positions.length === 0) return 0;
        if (positions.length >= 10) return 0.9;
        return Math.min(positions.length / 10, 0.9);
    }

    estimateCashPosition(totalValue, positions) {
        const positionsValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
        return Math.max(0, totalValue - positionsValue);
    }

    calculateUrgency(discovery, age) {
        // High-confidence discoveries with good volume spikes are more urgent
        const confidenceUrgency = (discovery.confidence || 0) * 0.4;
        const volumeUrgency = Math.min((discovery.volumeSpike || 1) / 10, 1) * 0.4;
        const timeDecay = Math.max(0, 1 - (age / 24)) * 0.2; // Decay over 24 hours
        
        return Math.min(confidenceUrgency + volumeUrgency + timeDecay, 1);
    }

    getOptimalEntryTiming(discovery) {
        const score = discovery.score || 0;
        const volumeSpike = discovery.volumeSpike || 1;
        
        if (score > 80 && volumeSpike > 5) return 'immediate';
        if (score > 60 && volumeSpike > 3) return 'next-session';
        return 'monitor';
    }

    assessPortfolioRisk(portfolio) {
        const positions = portfolio.positions || [];
        const avgWolfScore = positions.length > 0 
            ? positions.reduce((sum, pos) => sum + (pos.riskAnalysis?.wolfScore || 0.5), 0) / positions.length
            : 0.5;
        
        if (avgWolfScore > 0.7) return 'high';
        if (avgWolfScore > 0.4) return 'moderate';
        return 'low';
    }

    assessCorrelationRisk(discovery, portfolio) {
        // Simple sector correlation check
        const positions = portfolio.positions || [];
        const symbol = discovery.symbol;
        
        // Check if we already have similar positions (simple symbol similarity)
        const similarPositions = positions.filter(pos => 
            pos.symbol.substring(0, 2) === symbol.substring(0, 2) ||
            Math.abs(pos.symbol.length - symbol.length) <= 1
        );
        
        if (similarPositions.length > 2) return 'high';
        if (similarPositions.length > 0) return 'moderate';
        return 'low';
    }

    combineRiskFactors(individual, portfolio, correlation) {
        const riskLevels = { 'low': 1, 'moderate': 2, 'high': 3 };
        const avgRisk = (riskLevels[individual] + riskLevels[portfolio] + riskLevels[correlation]) / 3;
        
        if (avgRisk >= 2.5) return 'high';
        if (avgRisk >= 1.5) return 'moderate';
        return 'low';
    }

    suggestRiskMitigation(discovery, portfolio) {
        const suggestions = [];
        
        if (portfolio.positions?.length > 8) {
            suggestions.push('Consider reducing position count before adding new positions');
        }
        
        if (discovery.score < 70) {
            suggestions.push('Wait for higher confidence signal or reduce position size');
        }
        
        if (portfolio.dailyPnL < -500) {
            suggestions.push('Portfolio in drawdown - consider defensive positioning');
        }
        
        return suggestions;
    }

    getTimingMultiplier(marketContext) {
        if (marketContext.optimalTiming && marketContext.volatilityLevel === 'high') return 1.2;
        if (marketContext.optimalTiming) return 1.1;
        if (marketContext.session === 'closed') return 0.8;
        return 1.0;
    }

    getMomentumBoost(discovery) {
        const volumeBoost = Math.min((discovery.volumeSpike || 1) / 10, 0.2);
        const confidenceBoost = (discovery.confidence || 0) * 0.1;
        return 1.0 + volumeBoost + confidenceBoost;
    }

    generateOpportunityReasoning(discovery, marketContext) {
        const reasons = [];
        
        if (marketContext.optimalTiming) {
            reasons.push(`Optimal market timing (${marketContext.sessionPhase})`);
        }
        
        if (discovery.volumeSpike > 5) {
            reasons.push(`Strong volume spike (${discovery.volumeSpike}x)`);
        }
        
        if (discovery.confidence > 0.8) {
            reasons.push(`High pattern confidence (${Math.round(discovery.confidence * 100)}%)`);
        }
        
        return reasons.join('; ');
    }

    /**
     * Generate intelligent summary for dashboard
     */
    generateContextSummary(enrichedDiscoveries, portfolio) {
        const marketContext = this.getMarketContext();
        const portfolioContext = this.getPortfolioContext(portfolio);
        
        const highOpportunity = enrichedDiscoveries.filter(d => 
            d.context.opportunity.enhanced > 0.7
        ).length;
        
        const highRisk = enrichedDiscoveries.filter(d => 
            d.context.risk.combined === 'high'
        ).length;
        
        return {
            market: {
                session: marketContext.session,
                phase: marketContext.sessionPhase,
                optimal: marketContext.optimalTiming
            },
            portfolio: {
                riskCapacity: portfolioContext.riskCapacity,
                diversification: Math.round(portfolioContext.diversification * 100),
                momentum: portfolioContext.momentum > 0 ? 'positive' : 'negative'
            },
            opportunities: {
                total: enrichedDiscoveries.length,
                high: highOpportunity,
                recommendation: this.generateRecommendation(highOpportunity, highRisk, marketContext)
            }
        };
    }

    generateRecommendation(highOpportunity, highRisk, marketContext) {
        if (highOpportunity > 2 && marketContext.optimalTiming) {
            return 'Strong opportunities available - consider selective positioning';
        }
        if (highRisk > highOpportunity) {
            return 'Elevated risk levels - focus on risk management';
        }
        if (marketContext.session === 'closed') {
            return 'Market closed - review and plan for next session';
        }
        return 'Monitor for optimal entry opportunities';
    }
}

module.exports = ContextIntelligence;