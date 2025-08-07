/**
 * Position Thesis Generator
 * Generates detailed investment thesis for each position
 */

class PositionThesis {
  /**
   * Generate comprehensive thesis for a position
   */
  static generateThesis(position, viglData = null) {
    const { 
      symbol, 
      avgEntryPrice, 
      currentPrice, 
      unrealizedPnLPercent,
      dailyPnLPercent,
      qty,
      marketValue 
    } = position;
    
    // Calculate key metrics
    const totalReturn = unrealizedPnLPercent;
    const todayChange = dailyPnLPercent || 0;
    
    // Calculate realistic target prices based on entry and current performance
    const targetPrices = this.calculateTargetPrices(avgEntryPrice, currentPrice, totalReturn);
    
    // Generate performance-based recommendation
    const recommendation = this.generateRecommendation(totalReturn, todayChange, position);
    
    // Build detailed thesis
    const thesis = {
      symbol,
      entryPrice: avgEntryPrice,
      currentPrice,
      targetPrices,
      upside: targetPrices.upside,
      
      // Performance metrics
      performance: {
        total: {
          amount: position.unrealizedPnL,
          percent: totalReturn,
          status: totalReturn > 0 ? 'profitable' : 'losing'
        },
        today: {
          amount: position.dailyPnL || 0,
          percent: todayChange,
          status: todayChange > 0 ? 'up' : todayChange < 0 ? 'down' : 'flat'
        }
      },
      
      // Investment thesis
      thesis: this.buildThesisNarrative(position, targetPrices, recommendation),
      
      // Action recommendation
      recommendation: recommendation.action,
      confidence: recommendation.confidence,
      reasoning: recommendation.reasoning,
      
      // Risk assessment
      risk: this.assessRisk(position, totalReturn, todayChange),
      
      // Timeline
      timeline: this.estimateTimeline(recommendation.action, totalReturn),
      
      // Position sizing
      sizing: {
        current: qty,
        recommended: recommendation.sizing,
        portfolioWeight: (marketValue / 100000) * 100 // Assuming 100k portfolio
      }
    };
    
    // Add VIGL pattern if available
    if (viglData) {
      thesis.viglPattern = {
        similarity: viglData.confidence,
        detected: viglData.confidence > 0.7,
        volumeMultiple: viglData.volumeSpike
      };
    }
    
    return thesis;
  }
  
  /**
   * Calculate realistic target prices
   */
  static calculateTargetPrices(entryPrice, currentPrice, currentReturn) {
    // Base targets on entry price for consistency
    const conservative = entryPrice * 1.15; // 15% gain from entry
    const moderate = entryPrice * 1.35;     // 35% gain from entry
    const aggressive = entryPrice * 1.75;   // 75% gain from entry
    
    // Calculate actual upside percentages from current price
    const conservativeUpside = ((conservative - currentPrice) / currentPrice) * 100;
    const moderateUpside = ((moderate - currentPrice) / currentPrice) * 100;
    const aggressiveUpside = ((aggressive - currentPrice) / currentPrice) * 100;
    
    // Adjust targets if position is already profitable
    let targets = {
      conservative,
      moderate,
      aggressive
    };
    
    if (currentReturn > 50) {
      // Position already up significantly, adjust targets higher
      targets.conservative = currentPrice * 1.1;
      targets.moderate = currentPrice * 1.25;
      targets.aggressive = currentPrice * 1.5;
    } else if (currentReturn < -15) {
      // Position down significantly, focus on recovery
      targets.conservative = entryPrice * 0.95; // Just below breakeven
      targets.moderate = entryPrice * 1.1;
      targets.aggressive = entryPrice * 1.3;
    }
    
    return {
      ...targets,
      upside: {
        conservative: conservativeUpside,
        moderate: moderateUpside,
        aggressive: aggressiveUpside,
        primary: moderateUpside // Default display
      }
    };
  }
  
  /**
   * Generate position recommendation
   */
  static generateRecommendation(totalReturn, todayChange, position) {
    let action = 'HOLD';
    let confidence = 0.5;
    let reasoning = '';
    let sizing = position.qty;
    
    // Decision logic based on performance
    if (totalReturn < -20) {
      // Deep loss - consider exit
      action = 'SELL';
      confidence = 0.8;
      reasoning = 'Position down significantly (-20%+), consider cutting losses to preserve capital';
      sizing = 0;
    } else if (totalReturn < -15 && todayChange < -3) {
      // Losing position getting worse
      action = 'REDUCE';
      confidence = 0.7;
      reasoning = 'Position deteriorating, reduce exposure to manage risk';
      sizing = Math.floor(position.qty / 2);
    } else if (totalReturn < -10 && todayChange > 2) {
      // Losing position but recovering
      action = 'HOLD';
      confidence = 0.6;
      reasoning = 'Position recovering from losses, monitor for continued improvement';
    } else if (totalReturn < -5) {
      // Small loss
      action = todayChange < -2 ? 'HOLD_TIGHT' : 'HOLD';
      confidence = 0.5;
      reasoning = 'Minor drawdown within normal range, maintain position';
    } else if (totalReturn > 30 && todayChange < -5) {
      // Profitable position pulling back sharply
      action = 'TAKE_PARTIAL';
      confidence = 0.7;
      reasoning = 'Strong winner pulling back, consider taking partial profits';
      sizing = Math.floor(position.qty * 0.75);
    } else if (totalReturn > 20 && todayChange > 3) {
      // Strong winner continuing up
      action = 'ADD';
      confidence = 0.7;
      reasoning = 'Strong momentum in winning position, consider adding on strength';
      sizing = position.qty + Math.floor(position.qty * 0.25);
    } else if (totalReturn > 10) {
      // Moderate winner
      action = 'HOLD';
      confidence = 0.6;
      reasoning = 'Position performing well, let winner run';
    } else if (totalReturn > 0 && todayChange > 5) {
      // Breakout move
      action = 'ADD';
      confidence = 0.65;
      reasoning = 'Strong daily move suggests momentum building';
      sizing = position.qty + Math.floor(position.qty * 0.2);
    } else {
      // Neutral position
      action = 'HOLD';
      confidence = 0.5;
      reasoning = 'Position stable, continue monitoring';
    }
    
    // Adjust for position size
    const portfolioWeight = (position.marketValue / 100000) * 100;
    if (portfolioWeight > 15 && action === 'ADD') {
      action = 'HOLD';
      reasoning += ' (position already large)';
    }
    
    return { action, confidence, reasoning, sizing };
  }
  
  /**
   * Build narrative thesis
   */
  static buildThesisNarrative(position, targets, recommendation) {
    const { symbol, unrealizedPnLPercent, dailyPnLPercent } = position;
    const totalReturn = unrealizedPnLPercent;
    const todayChange = dailyPnLPercent || 0;
    
    let narrative = '';
    
    // Current status
    if (totalReturn > 20) {
      narrative = `${symbol} is a strong performer, up ${totalReturn.toFixed(1)}% since entry. `;
    } else if (totalReturn > 0) {
      narrative = `${symbol} is profitable, up ${totalReturn.toFixed(1)}% since entry. `;
    } else if (totalReturn > -10) {
      narrative = `${symbol} is slightly underwater at ${totalReturn.toFixed(1)}%. `;
    } else {
      narrative = `${symbol} is down ${Math.abs(totalReturn).toFixed(1)}% from entry. `;
    }
    
    // Today's action
    if (Math.abs(todayChange) > 5) {
      narrative += todayChange > 0 
        ? `Strong move today (+${todayChange.toFixed(1)}%) suggests momentum building. `
        : `Sharp decline today (${todayChange.toFixed(1)}%) requires attention. `;
    } else if (Math.abs(todayChange) > 2) {
      narrative += todayChange > 0
        ? `Positive movement today (+${todayChange.toFixed(1)}%). `
        : `Pulling back today (${todayChange.toFixed(1)}%). `;
    }
    
    // Target analysis
    if (targets.upside.primary > 50) {
      narrative += `Significant upside potential of ${targets.upside.primary.toFixed(0)}% to target. `;
    } else if (targets.upside.primary > 20) {
      narrative += `Moderate upside of ${targets.upside.primary.toFixed(0)}% to target. `;
    } else if (targets.upside.primary > 0) {
      narrative += `Limited upside of ${targets.upside.primary.toFixed(0)}% remaining. `;
    } else {
      narrative += `Position above initial targets, consider taking profits. `;
    }
    
    // Recommendation context
    narrative += recommendation.reasoning;
    
    return narrative;
  }
  
  /**
   * Assess position risk
   */
  static assessRisk(position, totalReturn, todayChange) {
    let riskLevel = 'MODERATE';
    let riskScore = 0.5;
    const factors = [];
    
    // Loss-based risk
    if (totalReturn < -20) {
      riskLevel = 'HIGH';
      riskScore = 0.8;
      factors.push('Significant drawdown');
    } else if (totalReturn < -15) {
      riskLevel = 'ELEVATED';
      riskScore = 0.7;
      factors.push('Notable loss');
    }
    
    // Volatility risk
    if (Math.abs(todayChange) > 7) {
      riskScore += 0.1;
      factors.push('High volatility');
    }
    
    // Position size risk
    const portfolioWeight = (position.marketValue / 100000) * 100;
    if (portfolioWeight > 20) {
      riskScore += 0.15;
      factors.push('Concentrated position');
    } else if (portfolioWeight > 15) {
      riskScore += 0.1;
      factors.push('Large position');
    }
    
    // Adjust risk level based on score
    if (riskScore >= 0.8) riskLevel = 'HIGH';
    else if (riskScore >= 0.6) riskLevel = 'ELEVATED';
    else if (riskScore <= 0.3) riskLevel = 'LOW';
    
    return {
      level: riskLevel,
      score: Math.min(riskScore, 1.0),
      factors
    };
  }
  
  /**
   * Estimate investment timeline
   */
  static estimateTimeline(action, currentReturn) {
    if (action === 'SELL') return 'Exit now';
    if (action === 'REDUCE') return 'Reduce within 1-2 days';
    if (action === 'TAKE_PARTIAL') return 'Take profits soon';
    
    if (currentReturn > 20) return '1-3 months';
    if (currentReturn > 0) return '3-6 months';
    if (currentReturn > -10) return '6-12 months';
    
    return '6+ months (recovery)';
  }
}

module.exports = PositionThesis;