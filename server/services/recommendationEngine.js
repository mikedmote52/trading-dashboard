/**
 * Position Recommendation Engine
 * Provides intelligent buy/hold/sell recommendations based on thesis performance
 */

class RecommendationEngine {
  
  /**
   * Generate recommendation for a position based on thesis and current data
   */
  static generateRecommendation(position, thesis, marketData = {}) {
    const { symbol, unrealizedPnLPercent, currentPrice } = position;
    const { 
      entryScore = 65, 
      currentScore = 65, 
      scoreDelta = 0,
      thesisStrength,
      daysSinceEntry = 0,
      targetPrice,
      stopLoss
    } = thesis || {};

    // Base recommendation logic
    let action = 'HOLD';
    let confidence = 60;
    let reasoning = 'Monitoring position';
    let urgency = 'LOW';
    let suggestedAmount = '';

    // Score-based analysis
    if (currentScore >= 85) {
      action = 'BUY MORE';
      confidence = 85;
      reasoning = `Strong AlphaStack score (${currentScore}) suggests continued opportunity`;
      suggestedAmount = '$500';
    } else if (currentScore <= 40) {
      action = 'REDUCE';
      confidence = 80;
      reasoning = `Weak AlphaStack score (${currentScore}) indicates deteriorating fundamentals`;
      suggestedAmount = '50%';
      urgency = 'MEDIUM';
    }

    // Thesis strength analysis
    if (thesisStrength === 'WEAKENING' && scoreDelta <= -10) {
      action = 'REDUCE';
      confidence = Math.max(confidence, 75);
      reasoning = `Thesis weakening (${scoreDelta} point drop) - consider reducing exposure`;
      suggestedAmount = '25%';
      urgency = 'MEDIUM';
    } else if (thesisStrength === 'STRENGTHENING' && scoreDelta >= 10) {
      action = 'BUY MORE';
      confidence = Math.max(confidence, 80);
      reasoning = `Thesis strengthening (+${scoreDelta} points) - opportunity to add`;
      suggestedAmount = '$750';
    }

    // P&L-based analysis
    const pnlPercent = unrealizedPnLPercent || 0;
    if (pnlPercent >= 50) {
      action = 'REDUCE';
      confidence = Math.max(confidence, 70);
      reasoning = `Large gain (+${pnlPercent.toFixed(1)}%) - consider taking profits`;
      suggestedAmount = '25%';
    } else if (pnlPercent <= -20) {
      if (currentScore >= 70) {
        action = 'BUY MORE';
        reasoning = `Good entry opportunity - down ${Math.abs(pnlPercent).toFixed(1)}% but score still strong (${currentScore})`;
        suggestedAmount = '$300';
        confidence = 70;
      } else {
        action = 'REDUCE';
        reasoning = `Stop loss consideration - down ${Math.abs(pnlPercent).toFixed(1)}% with weak score (${currentScore})`;
        suggestedAmount = '50%';
        confidence = 80;
        urgency = 'HIGH';
      }
    }

    // Target price analysis
    if (targetPrice && currentPrice) {
      const targetUpside = ((targetPrice - currentPrice) / currentPrice) * 100;
      if (targetUpside <= 5) {
        action = 'REDUCE';
        confidence = Math.max(confidence, 75);
        reasoning = `Near target price - limited upside remaining (${targetUpside.toFixed(1)}%)`;
        suggestedAmount = '50%';
      }
    }

    // Time-based analysis
    if (daysSinceEntry >= 90 && pnlPercent < 10) {
      confidence = Math.max(confidence, 65);
      reasoning += ` Position held ${daysSinceEntry} days with limited progress`;
    }

    // Determine action priority color
    const actionColor = {
      'BUY MORE': 'text-green-400',
      'HOLD': 'text-blue-400',
      'REDUCE': 'text-yellow-400',
      'SELL': 'text-red-400'
    };

    // Urgency styling
    const urgencyStyle = {
      'LOW': 'border-gray-500',
      'MEDIUM': 'border-yellow-500',
      'HIGH': 'border-red-500'
    };

    return {
      action,
      confidence,
      reasoning,
      urgency,
      suggestedAmount,
      actionColor: actionColor[action],
      urgencyStyle: urgencyStyle[urgency],
      metadata: {
        scoreAnalysis: {
          current: currentScore,
          entry: entryScore,
          delta: scoreDelta,
          trend: scoreDelta > 5 ? 'IMPROVING' : scoreDelta < -5 ? 'DECLINING' : 'STABLE'
        },
        performanceAnalysis: {
          pnlPercent,
          daysSinceEntry,
          targetUpside: targetPrice && currentPrice ? ((targetPrice - currentPrice) / currentPrice) * 100 : null
        }
      }
    };
  }

  /**
   * Generate action buttons for a position
   */
  static generateActionButtons(position, recommendation) {
    const { symbol, currentPrice } = position;
    const { action, suggestedAmount } = recommendation;

    const buttons = [];

    // Always include a BUY button
    buttons.push({
      type: 'BUY',
      label: 'BUY $500',
      amount: '$500',
      shares: Math.floor(500 / currentPrice),
      color: 'bg-green-600 hover:bg-green-700',
      priority: action === 'BUY MORE' ? 'PRIMARY' : 'SECONDARY'
    });

    // Add REDUCE button if recommended
    if (action === 'REDUCE' || action === 'SELL') {
      const percentage = suggestedAmount.includes('%') ? suggestedAmount : '25%';
      buttons.push({
        type: 'REDUCE',
        label: `REDUCE ${percentage}`,
        amount: percentage,
        color: 'bg-yellow-600 hover:bg-yellow-700',
        priority: 'PRIMARY'
      });
    }

    // Add SELL ALL button for high urgency situations
    if (recommendation.urgency === 'HIGH') {
      buttons.push({
        type: 'SELL',
        label: 'SELL ALL',
        amount: '100%',
        color: 'bg-red-600 hover:bg-red-700',
        priority: 'WARNING'
      });
    }

    return buttons;
  }

  /**
   * Get portfolio-wide recommendations summary
   */
  static getPortfolioRecommendations(enhancedPositions) {
    const recommendations = enhancedPositions.map(ep => ep.recommendation).filter(Boolean);
    
    const actionCounts = recommendations.reduce((acc, rec) => {
      acc[rec.action] = (acc[rec.action] || 0) + 1;
      return acc;
    }, {});

    const highUrgency = recommendations.filter(r => r.urgency === 'HIGH').length;
    const avgConfidence = recommendations.length > 0 
      ? Math.round(recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length)
      : 0;

    return {
      totalPositions: recommendations.length,
      actionCounts,
      highUrgencyCount: highUrgency,
      avgConfidence,
      needsAttention: highUrgency > 0 || actionCounts['REDUCE'] > 0 || actionCounts['SELL'] > 0
    };
  }
}

module.exports = RecommendationEngine;