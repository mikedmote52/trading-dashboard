/**
 * Data Validation Utilities
 * Ensures portfolio data is accurate and sensible
 */

class DataValidation {
  /**
   * Validate and clean position data from Alpaca
   */
  static validatePosition(position) {
    const cleaned = {
      symbol: position.symbol || 'UNKNOWN',
      qty: this.validateNumber(position.qty, 0),
      currentPrice: this.validatePrice(position.current_price, position.market_value, position.qty),
      avgEntryPrice: this.validateNumber(position.avg_entry_price, 0),
      marketValue: this.validateNumber(position.market_value, 0),
      unrealizedPnL: this.validateNumber(position.unrealized_pl, 0),
      unrealizedPnLPercent: this.validatePercent(position.unrealized_plpc),
      side: position.side || 'long'
    };
    
    // Calculate daily change if available
    const dailyChange = this.validateNumber(position.change_today, null);
    const dailyChangePercent = this.validatePercent(position.percent_change_today);
    
    cleaned.dailyPnL = dailyChange !== null ? cleaned.qty * dailyChange : null;
    cleaned.dailyPnLPercent = dailyChangePercent;
    cleaned.changeToday = dailyChange;
    cleaned.hasDailyData = dailyChange !== null;
    
    // Recalculate total P&L if it seems wrong
    if (cleaned.currentPrice > 0 && cleaned.avgEntryPrice > 0) {
      const calculatedPnL = (cleaned.currentPrice - cleaned.avgEntryPrice) * cleaned.qty;
      const calculatedPercent = ((cleaned.currentPrice - cleaned.avgEntryPrice) / cleaned.avgEntryPrice) * 100;
      
      // Use calculated values if they're more sensible
      if (Math.abs(calculatedPnL - cleaned.unrealizedPnL) > Math.abs(calculatedPnL * 0.1)) {
        console.log(`⚠️ ${cleaned.symbol}: Using calculated P&L (${calculatedPnL.toFixed(2)}) instead of Alpaca P&L (${cleaned.unrealizedPnL.toFixed(2)})`);
        cleaned.unrealizedPnL = calculatedPnL;
        cleaned.unrealizedPnLPercent = calculatedPercent;
      }
    }
    
    // Add cost basis
    cleaned.costBasis = cleaned.avgEntryPrice * cleaned.qty;
    
    // Add validation flags
    cleaned.validation = {
      hasDailyData: cleaned.hasDailyData,
      pricesValid: cleaned.currentPrice > 0 && cleaned.avgEntryPrice > 0,
      pnlCalculated: Math.abs(cleaned.unrealizedPnL - ((cleaned.currentPrice - cleaned.avgEntryPrice) * cleaned.qty)) < 0.01
    };
    
    return cleaned;
  }
  
  /**
   * Validate numeric values
   */
  static validateNumber(value, defaultValue = 0) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  /**
   * Validate percentage values
   */
  static validatePercent(value) {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return null;
    
    // If it's already in percentage form (like 0.05 for 5%), convert
    if (Math.abs(parsed) <= 1) {
      return parsed * 100;
    }
    
    // If it's already a percentage (like 5 for 5%), use as is
    return parsed;
  }
  
  /**
   * Validate current price with fallback calculation
   */
  static validatePrice(currentPrice, marketValue, qty) {
    const directPrice = parseFloat(currentPrice);
    const calculatedPrice = parseFloat(marketValue) / parseFloat(qty);
    
    // If we have a direct current price and it's reasonable, use it
    if (!isNaN(directPrice) && directPrice > 0) {
      return directPrice;
    }
    
    // Otherwise calculate from market value
    if (!isNaN(calculatedPrice) && calculatedPrice > 0) {
      return calculatedPrice;
    }
    
    // Last resort
    return 0;
  }
  
  /**
   * Validate portfolio summary
   */
  static validatePortfolioSummary(positions, account) {
    const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const totalDailyPnL = positions
      .filter(p => p.hasDailyData)
      .reduce((sum, p) => sum + (p.dailyPnL || 0), 0);
    
    // Calculate total return percentage
    const totalCostBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);
    const totalReturn = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;
    
    return {
      totalValue: account.portfolio_value || totalMarketValue,
      dailyPnL: account.todays_pl || (positions.filter(p => p.hasDailyData).length > 0 ? totalDailyPnL : null),
      totalPnL,
      totalPnLPercent: totalReturn,
      buyingPower: parseFloat(account.buying_power || 0),
      cash: parseFloat(account.cash || 0),
      positionsWithDailyData: positions.filter(p => p.hasDailyData).length,
      totalPositions: positions.length
    };
  }
  
  /**
   * Generate data quality report
   */
  static generateQualityReport(positions, summary) {
    const issues = [];
    const warnings = [];
    
    // Check for missing daily data
    const positionsWithoutDaily = positions.filter(p => !p.hasDailyData);
    if (positionsWithoutDaily.length > 0) {
      warnings.push(`${positionsWithoutDaily.length} positions missing daily change data: ${positionsWithoutDaily.map(p => p.symbol).join(', ')}`);
    }
    
    // Check for invalid prices
    const invalidPrices = positions.filter(p => !p.validation.pricesValid);
    if (invalidPrices.length > 0) {
      issues.push(`${invalidPrices.length} positions have invalid price data: ${invalidPrices.map(p => p.symbol).join(', ')}`);
    }
    
    // Check for P&L calculation mismatches
    const pnlMismatches = positions.filter(p => !p.validation.pnlCalculated);
    if (pnlMismatches.length > 0) {
      warnings.push(`${pnlMismatches.length} positions may have P&L calculation issues`);
    }
    
    return {
      issues,
      warnings,
      quality: issues.length === 0 ? 'GOOD' : 'POOR',
      completeness: (positions.filter(p => p.hasDailyData).length / positions.length) * 100
    };
  }
}

module.exports = DataValidation;