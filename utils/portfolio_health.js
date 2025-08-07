/**
 * Portfolio Health Analysis System
 * Provides comprehensive health review of trading portfolio
 */

class PortfolioHealth {
  /**
   * Generate comprehensive portfolio health report
   */
  static analyzePortfolioHealth(portfolio, discoveries = []) {
    if (!portfolio || !portfolio.positions || portfolio.positions.length === 0) {
      return this.getEmptyPortfolioHealth();
    }

    const positions = portfolio.positions;
    const totalValue = portfolio.totalValue || 0;
    const dailyPnL = portfolio.dailyPnL || 0;
    const totalPnL = portfolio.totalPnL || 0;
    
    // Calculate key metrics
    const metrics = this.calculateMetrics(positions, totalValue);
    
    // Analyze portfolio composition
    const composition = this.analyzeComposition(positions, totalValue);
    
    // Risk assessment
    const riskProfile = this.assessRisk(positions, metrics);
    
    // Performance analysis
    const performance = this.analyzePerformance(positions, dailyPnL, totalPnL, totalValue);
    
    // Generate strategic outlook
    const outlook = this.generateOutlook(positions, metrics, riskProfile);
    
    // Opportunities analysis
    const opportunities = this.identifyOpportunities(positions, discoveries);
    
    return {
      summary: {
        health: this.calculateHealthScore(metrics, riskProfile, performance),
        status: this.getHealthStatus(metrics, riskProfile),
        totalValue,
        dailyPnL,
        totalPnL,
        totalReturn: (totalPnL / (totalValue - totalPnL)) * 100,
        positionCount: positions.length
      },
      metrics,
      composition,
      riskProfile,
      performance,
      outlook,
      opportunities,
      recommendations: this.generateRecommendations(metrics, riskProfile, composition),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Calculate portfolio metrics
   */
  static calculateMetrics(positions, totalValue) {
    const winners = positions.filter(p => p.unrealizedPnL > 0);
    const losers = positions.filter(p => p.unrealizedPnL < 0);
    
    const bestPerformer = positions.reduce((best, pos) => 
      pos.unrealizedPnLPercent > best.unrealizedPnLPercent ? pos : best
    , positions[0]);
    
    const worstPerformer = positions.reduce((worst, pos) => 
      pos.unrealizedPnLPercent < worst.unrealizedPnLPercent ? pos : worst
    , positions[0]);
    
    const avgReturn = positions.reduce((sum, p) => sum + p.unrealizedPnLPercent, 0) / positions.length;
    
    // Calculate volatility (simplified)
    const dailyChanges = positions.map(p => p.dailyPnLPercent || 0);
    const avgDailyChange = dailyChanges.reduce((sum, c) => sum + c, 0) / dailyChanges.length;
    const variance = dailyChanges.reduce((sum, c) => sum + Math.pow(c - avgDailyChange, 2), 0) / dailyChanges.length;
    const volatility = Math.sqrt(variance);
    
    return {
      winRate: (winners.length / positions.length) * 100,
      avgReturn,
      bestPerformer: {
        symbol: bestPerformer.symbol,
        return: bestPerformer.unrealizedPnLPercent,
        pnl: bestPerformer.unrealizedPnL
      },
      worstPerformer: {
        symbol: worstPerformer.symbol,
        return: worstPerformer.unrealizedPnLPercent,
        pnl: worstPerformer.unrealizedPnL
      },
      volatility,
      sharpeRatio: avgReturn / (volatility || 1), // Simplified Sharpe
      maxDrawdown: Math.min(...positions.map(p => p.unrealizedPnLPercent)),
      totalWinners: winners.length,
      totalLosers: losers.length
    };
  }
  
  /**
   * Analyze portfolio composition
   */
  static analyzeComposition(positions, totalValue) {
    const composition = {};
    
    // Position concentration
    const concentrations = positions.map(p => ({
      symbol: p.symbol,
      weight: (p.marketValue / totalValue) * 100,
      value: p.marketValue
    })).sort((a, b) => b.weight - a.weight);
    
    // Identify concentration risk
    const topPosition = concentrations[0];
    const top3Weight = concentrations.slice(0, 3).reduce((sum, p) => sum + p.weight, 0);
    
    return {
      positions: concentrations,
      largestPosition: topPosition,
      top3Concentration: top3Weight,
      diversificationScore: this.calculateDiversification(concentrations),
      concentrationRisk: topPosition.weight > 25 ? 'HIGH' : 
                        topPosition.weight > 15 ? 'MODERATE' : 'LOW'
    };
  }
  
  /**
   * Assess portfolio risk
   */
  static assessRisk(positions, metrics) {
    let riskScore = 0;
    const riskFactors = [];
    
    // Drawdown risk
    if (metrics.maxDrawdown < -20) {
      riskScore += 30;
      riskFactors.push('Significant drawdown detected');
    } else if (metrics.maxDrawdown < -15) {
      riskScore += 20;
      riskFactors.push('Moderate drawdown');
    }
    
    // Volatility risk
    if (metrics.volatility > 5) {
      riskScore += 25;
      riskFactors.push('High volatility');
    } else if (metrics.volatility > 3) {
      riskScore += 15;
      riskFactors.push('Elevated volatility');
    }
    
    // Concentration risk
    const largestPosition = Math.max(...positions.map(p => (p.marketValue / positions.reduce((sum, pos) => sum + pos.marketValue, 0)) * 100));
    if (largestPosition > 30) {
      riskScore += 25;
      riskFactors.push('High concentration risk');
    } else if (largestPosition > 20) {
      riskScore += 15;
      riskFactors.push('Moderate concentration');
    }
    
    // Loss exposure
    const losingPositions = positions.filter(p => p.unrealizedPnLPercent < -10);
    if (losingPositions.length > positions.length * 0.5) {
      riskScore += 20;
      riskFactors.push('Multiple losing positions');
    }
    
    return {
      score: Math.min(riskScore, 100),
      level: riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MODERATE' : 'LOW',
      factors: riskFactors,
      recommendations: this.getRiskRecommendations(riskScore, riskFactors)
    };
  }
  
  /**
   * Analyze performance
   */
  static analyzePerformance(positions, dailyPnL, totalPnL, totalValue) {
    const dailyReturn = (dailyPnL / totalValue) * 100;
    const totalReturn = (totalPnL / (totalValue - totalPnL)) * 100;
    
    // Trend analysis
    const positiveDays = positions.filter(p => (p.dailyPnLPercent || 0) > 0).length;
    const momentum = positiveDays / positions.length;
    
    return {
      daily: {
        pnl: dailyPnL,
        return: dailyReturn,
        trend: dailyReturn > 0 ? 'UP' : dailyReturn < 0 ? 'DOWN' : 'FLAT'
      },
      total: {
        pnl: totalPnL,
        return: totalReturn,
        status: totalReturn > 20 ? 'EXCELLENT' : 
                totalReturn > 10 ? 'GOOD' : 
                totalReturn > 0 ? 'POSITIVE' : 
                totalReturn > -10 ? 'UNDERPERFORMING' : 'POOR'
      },
      momentum: {
        score: momentum,
        trend: momentum > 0.6 ? 'BULLISH' : momentum < 0.4 ? 'BEARISH' : 'NEUTRAL'
      },
      consistency: this.calculateConsistency(positions)
    };
  }
  
  /**
   * Generate strategic outlook
   */
  static generateOutlook(positions, metrics, riskProfile) {
    let outlook = '';
    let sentiment = 'NEUTRAL';
    
    if (metrics.winRate > 60 && riskProfile.score < 40) {
      outlook = 'Strong portfolio performance with controlled risk. Continue current strategy while monitoring for opportunities to take profits on winners.';
      sentiment = 'BULLISH';
    } else if (metrics.winRate > 50 && riskProfile.score < 60) {
      outlook = 'Moderate portfolio performance with acceptable risk levels. Consider rebalancing positions and reducing concentration in largest holdings.';
      sentiment = 'CAUTIOUSLY_OPTIMISTIC';
    } else if (metrics.winRate < 40 || riskProfile.score > 60) {
      outlook = 'Portfolio underperformance detected with elevated risk. Review losing positions for exit opportunities and reduce overall exposure.';
      sentiment = 'BEARISH';
    } else {
      outlook = 'Mixed portfolio signals. Focus on position-specific analysis and maintain disciplined risk management.';
    }
    
    return {
      summary: outlook,
      sentiment,
      timeframe: '3-6 months',
      keyFocus: this.getKeyFocusAreas(metrics, riskProfile)
    };
  }
  
  /**
   * Identify opportunities
   */
  static identifyOpportunities(positions, discoveries) {
    const opportunities = [];
    
    // Positions to add to
    const strongPerformers = positions.filter(p => 
      p.unrealizedPnLPercent > 10 && 
      (p.dailyPnLPercent || 0) > 0 &&
      p.marketValue < 20000
    );
    
    strongPerformers.forEach(pos => {
      opportunities.push({
        type: 'ADD',
        symbol: pos.symbol,
        reason: 'Strong performer with momentum',
        confidence: 0.7
      });
    });
    
    // Positions to reduce
    const weakPerformers = positions.filter(p => 
      p.unrealizedPnLPercent < -15 && 
      (p.dailyPnLPercent || 0) < -2
    );
    
    weakPerformers.forEach(pos => {
      opportunities.push({
        type: 'REDUCE',
        symbol: pos.symbol,
        reason: 'Underperforming with negative momentum',
        confidence: 0.8
      });
    });
    
    // New opportunities from discoveries
    if (discoveries && discoveries.length > 0) {
      const highConfidence = discoveries.filter(d => d.confidence > 0.8);
      highConfidence.slice(0, 2).forEach(disc => {
        opportunities.push({
          type: 'NEW',
          symbol: disc.symbol,
          reason: `High VIGL pattern match (${(disc.confidence * 100).toFixed(0)}%)`,
          confidence: disc.confidence
        });
      });
    }
    
    return opportunities;
  }
  
  /**
   * Generate recommendations
   */
  static generateRecommendations(metrics, riskProfile, composition) {
    const recommendations = [];
    
    // Risk-based recommendations
    if (riskProfile.score > 60) {
      recommendations.push({
        priority: 'HIGH',
        action: 'REDUCE_RISK',
        description: 'Portfolio risk is elevated. Consider reducing position sizes or exiting losing positions.',
        targets: riskProfile.factors
      });
    }
    
    // Concentration recommendations
    if (composition.top3Concentration > 60) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'DIVERSIFY',
        description: 'Top 3 positions represent over 60% of portfolio. Consider diversifying.',
        targets: composition.positions.slice(0, 3).map(p => p.symbol)
      });
    }
    
    // Performance recommendations
    if (metrics.winRate < 40) {
      recommendations.push({
        priority: 'HIGH',
        action: 'REVIEW_STRATEGY',
        description: 'Win rate below 40%. Review entry criteria and position selection.',
        targets: ['Entry strategy', 'Position sizing', 'Risk management']
      });
    }
    
    // Profit-taking recommendations
    if (metrics.bestPerformer.return > 50) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'TAKE_PROFITS',
        description: `Consider taking partial profits on ${metrics.bestPerformer.symbol} (+${metrics.bestPerformer.return.toFixed(1)}%)`,
        targets: [metrics.bestPerformer.symbol]
      });
    }
    
    return recommendations;
  }
  
  /**
   * Calculate health score (0-100)
   */
  static calculateHealthScore(metrics, riskProfile, performance) {
    let score = 50; // Base score
    
    // Performance factors (up to +30)
    score += Math.min(metrics.winRate / 2, 20); // Up to +20 for win rate
    score += Math.min(performance.total.return / 2, 10); // Up to +10 for returns
    
    // Risk factors (up to -30)
    score -= riskProfile.score / 3; // Reduce by risk score
    
    // Consistency bonus (up to +20)
    score += performance.consistency * 20;
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Get health status
   */
  static getHealthStatus(metrics, riskProfile) {
    if (metrics.winRate > 60 && riskProfile.score < 40) {
      return { level: 'EXCELLENT', emoji: '🟢', message: 'Portfolio performing well' };
    } else if (metrics.winRate > 45 && riskProfile.score < 60) {
      return { level: 'GOOD', emoji: '🟡', message: 'Portfolio stable with room for improvement' };
    } else if (riskProfile.score > 70 || metrics.winRate < 30) {
      return { level: 'POOR', emoji: '🔴', message: 'Portfolio needs immediate attention' };
    } else {
      return { level: 'FAIR', emoji: '🟠', message: 'Portfolio showing mixed signals' };
    }
  }
  
  /**
   * Helper functions
   */
  static calculateDiversification(concentrations) {
    // Herfindahl index
    const sumSquares = concentrations.reduce((sum, p) => sum + Math.pow(p.weight, 2), 0);
    return 1 - (sumSquares / 10000); // Normalized 0-1
  }
  
  static calculateConsistency(positions) {
    const profitable = positions.filter(p => p.unrealizedPnL > 0).length;
    return profitable / positions.length;
  }
  
  static getRiskRecommendations(score, factors) {
    if (score > 70) return 'Immediately reduce exposure and exit high-risk positions';
    if (score > 50) return 'Consider reducing position sizes and improving diversification';
    if (score > 30) return 'Monitor positions closely and maintain stop losses';
    return 'Risk levels acceptable, continue monitoring';
  }
  
  static getKeyFocusAreas(metrics, riskProfile) {
    const areas = [];
    
    if (riskProfile.score > 50) areas.push('Risk Management');
    if (metrics.winRate < 50) areas.push('Position Selection');
    if (metrics.volatility > 4) areas.push('Volatility Control');
    if (Math.abs(metrics.maxDrawdown) > 15) areas.push('Drawdown Recovery');
    
    return areas.length > 0 ? areas : ['Maintain Current Strategy'];
  }
  
  static getEmptyPortfolioHealth() {
    return {
      summary: {
        health: 0,
        status: { level: 'EMPTY', emoji: '⚪', message: 'No positions to analyze' },
        totalValue: 0,
        dailyPnL: 0,
        totalPnL: 0,
        totalReturn: 0,
        positionCount: 0
      },
      metrics: null,
      composition: null,
      riskProfile: null,
      performance: null,
      outlook: {
        summary: 'No portfolio data available',
        sentiment: 'NEUTRAL',
        timeframe: 'N/A',
        keyFocus: ['Build initial positions']
      },
      opportunities: [],
      recommendations: [
        {
          priority: 'HIGH',
          action: 'START_TRADING',
          description: 'Begin building portfolio with VIGL pattern discoveries',
          targets: []
        }
      ],
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = PortfolioHealth;