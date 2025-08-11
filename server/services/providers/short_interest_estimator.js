// Short Interest Estimation System
// Uses available market data to estimate short interest and borrow metrics

class ShortInterestEstimator {
  
  /**
   * Estimate short interest percentage using market signals
   * Factors that indicate high short interest:
   * - Low RSI (oversold conditions)
   * - High relative volume (shorts covering or building)
   * - Price decline vs market
   * - High volatility 
   * - Small float stocks (easier to squeeze)
   */
  static estimateShortInterest(marketData) {
    const {
      price,
      volume_today,
      avg_volume_30d,
      rsi,
      price_change_30d_pct,
      volatility_30d,
      float_shares,
      market_cap
    } = marketData;
    
    let shortInterestEst = 8.0; // More inclusive base estimate
    
    // Factor 1: RSI-based estimation (more generous)
    if (rsi < 25) shortInterestEst += 18; // Extremely oversold
    else if (rsi < 35) shortInterestEst += 12; // Very oversold  
    else if (rsi < 45) shortInterestEst += 6; // Moderately oversold
    else if (rsi > 75) shortInterestEst -= 2; // Overbought (smaller penalty)
    
    // Factor 2: Volume analysis (more inclusive)
    const relVolume = volume_today / (avg_volume_30d || volume_today);
    if (relVolume > 2.5) shortInterestEst += 10; // High volume = potential activity
    else if (relVolume > 1.5) shortInterestEst += 5; // Above average volume
    else if (relVolume > 1.0) shortInterestEst += 2; // Normal volume gets small bonus
    // No penalty for lower volume - just no bonus
    
    // Factor 3: Price performance (poor performance = more shorts)
    if (price_change_30d_pct < -20) shortInterestEst += 10;
    else if (price_change_30d_pct < -10) shortInterestEst += 5;
    else if (price_change_30d_pct > 20) shortInterestEst -= 5; // Strong performance
    
    // Factor 4: Volatility (high vol = more trading activity)
    if (volatility_30d > 60) shortInterestEst += 8;
    else if (volatility_30d > 40) shortInterestEst += 4;
    
    // Factor 5: Float size (smaller float = higher potential short %)
    if (float_shares < 50000000) shortInterestEst += 8; // Small float
    else if (float_shares < 100000000) shortInterestEst += 4; // Medium float
    else if (float_shares > 500000000) shortInterestEst -= 5; // Large float
    
    // Factor 6: Market cap considerations
    if (market_cap < 1000000000) shortInterestEst += 5; // Small cap = more volatile
    else if (market_cap > 50000000000) shortInterestEst -= 3; // Large cap = less short %
    
    // Cap the estimate at reasonable bounds
    return Math.max(1.0, Math.min(shortInterestEst, 80.0));
  }
  
  /**
   * Estimate days to cover based on volume patterns
   */
  static estimateDaysToCover(shortInterestPct, avgVolume, floatShares) {
    const estimatedShortShares = (floatShares * shortInterestPct) / 100;
    const daysToCover = estimatedShortShares / (avgVolume || 1000000);
    
    // Add volatility factor - more volatile = faster covering
    let adjustedDTC = daysToCover;
    if (avgVolume > floatShares * 0.02) adjustedDTC *= 0.7; // High turnover
    else if (avgVolume < floatShares * 0.005) adjustedDTC *= 1.5; // Low turnover
    
    return Math.max(0.1, Math.min(adjustedDTC, 30.0));
  }
  
  /**
   * Estimate borrow fee based on market conditions
   */
  static estimateBorrowFee(marketData) {
    const {
      price,
      volatility_30d,
      float_shares,
      avg_volume_30d,
      rsi,
      price_change_30d_pct
    } = marketData;
    
    let borrowFeeEst = 2.0; // Base rate
    
    // High volatility = higher borrow cost
    if (volatility_30d > 60) borrowFeeEst += 15;
    else if (volatility_30d > 40) borrowFeeEst += 8;
    else if (volatility_30d > 25) borrowFeeEst += 4;
    
    // Small float = harder to borrow
    if (float_shares < 25000000) borrowFeeEst += 20;
    else if (float_shares < 50000000) borrowFeeEst += 12;
    else if (float_shares < 100000000) borrowFeeEst += 6;
    
    // Strong recent performance = expensive to short
    if (price_change_30d_pct > 30) borrowFeeEst += 10;
    else if (price_change_30d_pct < -30) borrowFeeEst -= 3; // Cheap to short declining stocks
    
    // High volume = more liquidity = lower fees
    const turnover = avg_volume_30d / float_shares;
    if (turnover > 0.05) borrowFeeEst -= 3; // High turnover
    else if (turnover < 0.01) borrowFeeEst += 5; // Low turnover
    
    // Low price stocks are often harder to borrow
    if (price < 5) borrowFeeEst += 8;
    else if (price < 10) borrowFeeEst += 4;
    
    return Math.max(0.1, Math.min(borrowFeeEst, 100.0));
  }
  
  /**
   * Generate complete short interest metrics for a stock
   */
  static generateMetrics(marketData) {
    const shortInterestPct = this.estimateShortInterest(marketData);
    const daysToCover = this.estimateDaysToCover(
      shortInterestPct, 
      marketData.avg_volume_30d, 
      marketData.float_shares
    );
    const borrowFee = this.estimateBorrowFee(marketData);
    
    return {
      short_interest_pct: Math.round(shortInterestPct * 10) / 10,
      days_to_cover: Math.round(daysToCover * 10) / 10,
      borrow_fee_pct: Math.round(borrowFee * 10) / 10,
      borrow_fee_trend_pp7d: 0, // Neutral trend
      estimation_confidence: this.calculateConfidence(marketData),
      estimated: true,
      asof: new Date().toISOString().split('T')[0]
    };
  }
  
  /**
   * Calculate confidence in our estimation
   */
  static calculateConfidence(marketData) {
    let confidence = 0.7; // Base confidence
    
    // More data available = higher confidence
    if (marketData.rsi) confidence += 0.1;
    if (marketData.volatility_30d) confidence += 0.1; 
    if (marketData.avg_volume_30d) confidence += 0.1;
    if (marketData.float_shares) confidence += 0.05;
    
    return Math.min(confidence, 0.95);
  }
}

module.exports = ShortInterestEstimator;