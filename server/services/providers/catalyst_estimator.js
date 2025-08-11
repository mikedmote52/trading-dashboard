// Catalyst Estimation System  
// Detects potential catalysts using market patterns and timing

class CatalystEstimator {
  
  /**
   * Detect potential catalysts based on market behavior
   */
  static detectCatalyst(marketData) {
    const {
      symbol,
      volume_today,
      avg_volume_30d,
      price_change_1d_pct,
      price_change_5d_pct,
      volatility_30d,
      rsi
    } = marketData;
    
    const catalysts = [];
    
    // Volume-based catalyst detection
    const relVolume = volume_today / (avg_volume_30d || volume_today);
    if (relVolume > 3) {
      catalysts.push({
        type: 'volume_breakout',
        strength: Math.min(relVolume / 5, 1.0),
        description: `${relVolume.toFixed(1)}x volume spike`
      });
    }
    
    // Price movement catalyst detection
    if (Math.abs(price_change_1d_pct) > 10) {
      const direction = price_change_1d_pct > 0 ? 'breakout' : 'breakdown';
      catalysts.push({
        type: `price_${direction}`,
        strength: Math.min(Math.abs(price_change_1d_pct) / 20, 1.0),
        description: `${Math.abs(price_change_1d_pct).toFixed(1)}% ${direction}`
      });
    }
    
    // Momentum shift detection
    if (price_change_5d_pct < -15 && price_change_1d_pct > 5) {
      catalysts.push({
        type: 'reversal_setup',
        strength: 0.7,
        description: 'Potential reversal after decline'
      });
    }
    
    // Oversold bounce potential
    if (rsi < 25 && price_change_1d_pct > 3) {
      catalysts.push({
        type: 'oversold_bounce', 
        strength: 0.8,
        description: 'Bounce from oversold levels'
      });
    }
    
    // High volatility = potential news/events
    if (volatility_30d > 50) {
      catalysts.push({
        type: 'volatility_expansion',
        strength: Math.min(volatility_30d / 100, 0.9),
        description: 'High volatility suggests pending catalyst'
      });
    }
    
    // Pattern-based catalyst detection
    this.addPatternCatalysts(marketData, catalysts);
    
    // Earnings calendar approximation (quarterly timing)
    this.addEarningsEstimate(marketData, catalysts);
    
    return this.selectBestCatalyst(catalysts);
  }
  
  /**
   * Add pattern-based catalyst detection
   */
  static addPatternCatalysts(marketData, catalysts) {
    const { rsi, volume_today, avg_volume_30d, price_change_5d_pct } = marketData;
    
    // Squeeze setup pattern
    if (rsi < 35 && volume_today > avg_volume_30d * 1.5 && price_change_5d_pct < -5) {
      catalysts.push({
        type: 'squeeze_setup',
        strength: 0.8,
        description: 'Potential squeeze setup forming'
      });
    }
    
    // Accumulation pattern
    if (rsi > 45 && rsi < 60 && volume_today > avg_volume_30d * 2) {
      catalysts.push({
        type: 'accumulation',
        strength: 0.6, 
        description: 'Institutional accumulation pattern'
      });
    }
  }
  
  /**
   * Add earnings estimation based on quarterly cycles
   */
  static addEarningsEstimate(marketData, catalysts) {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    
    // Rough earnings seasons: Jan (Q4), Apr (Q1), Jul (Q2), Oct (Q3)
    const earningsMonths = [31, 120, 212, 304]; // Approximate day of year
    const nearestEarnings = earningsMonths.reduce((prev, curr) => 
      Math.abs(curr - dayOfYear) < Math.abs(prev - dayOfYear) ? curr : prev
    );
    
    const daysToEarnings = Math.abs(nearestEarnings - dayOfYear);
    
    if (daysToEarnings <= 30) {
      catalysts.push({
        type: 'earnings_approach',
        strength: Math.max(0.3, 1 - (daysToEarnings / 30)),
        description: `Estimated earnings in ~${daysToEarnings} days`,
        days_to_event: daysToEarnings
      });
    }
  }
  
  /**
   * Select the best catalyst from detected options
   */
  static selectBestCatalyst(catalysts) {
    if (catalysts.length === 0) {
      return {
        type: 'technical_pattern',
        verified_in_window: false,
        date_valid: false,
        days_to_event: 999,
        strength: 0.1,
        description: 'No strong catalyst detected',
        placeholder: true
      };
    }
    
    // Sort by strength and select the best
    const best = catalysts.sort((a, b) => b.strength - a.strength)[0];
    
    return {
      type: best.type,
      verified_in_window: best.strength > 0.5,
      date_valid: best.days_to_event ? true : false,
      days_to_event: best.days_to_event || 7,
      strength: best.strength,
      description: best.description,
      items: catalysts.map(c => c.description),
      placeholder: false
    };
  }
  
  /**
   * Generate complete catalyst data for a stock
   */
  static generateCatalyst(marketData) {
    return this.detectCatalyst(marketData);
  }
}

module.exports = CatalystEstimator;