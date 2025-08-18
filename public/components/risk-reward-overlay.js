// Risk/Reward Overlay Component - Feature 2: R-multiple calculations and visualization
class RiskRewardOverlay {
  constructor() {
    this.isEnabled = true;
    this.defaultStopLoss = 10; // 10% stop loss
    this.defaultTakeProfit = 25; // 25% take profit
    this.riskLevels = {
      conservative: { sl: 8, tp: 20 },
      moderate: { sl: 10, tp: 25 },
      aggressive: { sl: 15, tp: 40 }
    };
    
    this.init();
  }
  
  init() {
    console.log('📊 Risk/Reward Overlay initialized');
    
    // Add R-multiple columns to discovery tables
    this.addRiskRewardColumns();
    
    // Listen for discovery updates
    document.addEventListener('DOMContentLoaded', () => {
      this.addRiskRewardColumns();
    });
  }
  
  addRiskRewardColumns() {
    // Find all discovery tables
    const tables = document.querySelectorAll('table');
    
    tables.forEach(table => {
      this.enhanceTableWithRiskReward(table);
    });
    
    // Also handle div-based discovery layouts
    const discoveryRows = document.querySelectorAll('.discovery-row, [data-symbol]');
    discoveryRows.forEach(row => {
      if (!row.closest('table')) {
        this.addRiskRewardToRow(row);
      }
    });
  }
  
  enhanceTableWithRiskReward(table) {
    const header = table.querySelector('thead tr');
    const rows = table.querySelectorAll('tbody tr');
    
    if (!header || rows.length === 0) return;
    
    // Add R:R header if not exists
    if (!header.querySelector('.risk-reward-header')) {
      const rrHeader = document.createElement('th');
      rrHeader.className = 'risk-reward-header';
      rrHeader.innerHTML = 'Risk:Reward';
      rrHeader.title = 'Risk to Reward ratio (R-multiple)';
      header.appendChild(rrHeader);
    }
    
    // Add R:R data to each row
    rows.forEach(row => {
      this.addRiskRewardToTableRow(row);
    });
  }
  
  addRiskRewardToTableRow(row) {
    if (row.querySelector('.risk-reward-cell')) return;
    
    const symbol = this.extractSymbol(row);
    const price = this.extractPrice(row);
    const action = this.extractAction(row);
    
    if (!symbol || !price) return;
    
    const rrCell = document.createElement('td');
    rrCell.className = 'risk-reward-cell';
    
    // Calculate risk/reward ratios
    const riskReward = this.calculateRiskReward(price);
    
    rrCell.innerHTML = this.createRiskRewardHTML(riskReward, action);
    
    row.appendChild(rrCell);
  }
  
  addRiskRewardToRow(row) {
    if (row.querySelector('.risk-reward-overlay')) return;
    
    const symbol = this.extractSymbol(row);
    const price = this.extractPrice(row);
    const action = this.extractAction(row);
    
    if (!symbol || !price) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'risk-reward-overlay';
    
    const riskReward = this.calculateRiskReward(price);
    overlay.innerHTML = this.createRiskRewardHTML(riskReward, action);
    
    row.appendChild(overlay);
  }
  
  calculateRiskReward(price) {
    const calculations = {};
    
    Object.entries(this.riskLevels).forEach(([level, params]) => {
      const stopLossPrice = price * (1 - params.sl / 100);
      const takeProfitPrice = price * (1 + params.tp / 100);
      
      const risk = price - stopLossPrice;
      const reward = takeProfitPrice - price;
      
      const rMultiple = reward / risk;
      const winRate = this.estimateWinRate(rMultiple, level);
      const expectedValue = (rMultiple * winRate) - (1 - winRate);
      
      calculations[level] = {
        stopLoss: params.sl,
        takeProfit: params.tp,
        stopLossPrice: stopLossPrice,
        takeProfitPrice: takeProfitPrice,
        risk: risk,
        reward: reward,
        rMultiple: rMultiple,
        winRate: winRate,
        expectedValue: expectedValue,
        kelly: this.calculateKellyCriterion(rMultiple, winRate)
      };
    });
    
    return calculations;
  }
  
  estimateWinRate(rMultiple, level) {
    // Estimate win rates based on R-multiple and risk level
    // These are conservative estimates for VIGL patterns
    const baseWinRates = {
      conservative: 0.65,
      moderate: 0.55,
      aggressive: 0.45
    };
    
    const baseRate = baseWinRates[level] || 0.55;
    
    // Adjust for R-multiple (higher R usually means lower win rate)
    if (rMultiple > 3) return Math.max(baseRate * 0.7, 0.25);
    if (rMultiple > 2) return Math.max(baseRate * 0.85, 0.35);
    if (rMultiple > 1.5) return baseRate;
    
    return Math.min(baseRate * 1.15, 0.75);
  }
  
  calculateKellyCriterion(rMultiple, winRate) {
    // Kelly Criterion: f = (bp - q) / b
    // where b = odds received on wager (R-multiple)
    //       p = probability of winning (winRate)
    //       q = probability of losing (1 - winRate)
    
    const lossRate = 1 - winRate;
    const kelly = (rMultiple * winRate - lossRate) / rMultiple;
    
    return Math.max(0, Math.min(kelly, 0.25)); // Cap at 25% for safety
  }
  
  createRiskRewardHTML(riskReward, action) {
    const moderate = riskReward.moderate;
    
    if (action !== 'BUY') {
      return `
        <div class="rr-summary">
          <div class="rr-ratio non-buy">N/A</div>
          <div class="rr-note">Watch only</div>
        </div>
      `;
    }
    
    const rRatio = moderate.rMultiple;
    const expectedValue = moderate.expectedValue;
    
    let riskClass = 'poor';
    if (rRatio >= 2.5 && expectedValue > 0.3) riskClass = 'excellent';
    else if (rRatio >= 2.0 && expectedValue > 0.1) riskClass = 'good';
    else if (rRatio >= 1.5 && expectedValue > 0) riskClass = 'fair';
    
    return `
      <div class="rr-summary">
        <div class="rr-ratio ${riskClass}" title="Risk:Reward ratio">
          1:${rRatio.toFixed(1)}
        </div>
        <div class="rr-details">
          <div class="rr-ev ${expectedValue > 0 ? 'positive' : 'negative'}" title="Expected Value">
            EV: ${expectedValue > 0 ? '+' : ''}${(expectedValue * 100).toFixed(0)}%
          </div>
          <div class="rr-kelly" title="Kelly Criterion position size">
            Kelly: ${(moderate.kelly * 100).toFixed(1)}%
          </div>
        </div>
        <div class="rr-expand" title="Click for detailed analysis">📊</div>
      </div>
    `;
  }
  
  showDetailedAnalysis(symbol, price, riskReward) {
    const modal = document.createElement('div');
    modal.className = 'rr-modal-overlay';
    modal.innerHTML = `
      <div class="rr-modal">
        <div class="rr-modal-header">
          <h3>Risk/Reward Analysis: ${symbol}</h3>
          <button class="close-modal">&times;</button>
        </div>
        
        <div class="rr-modal-body">
          <div class="price-info">
            <span class="current-price">Entry: $${price.toFixed(2)}</span>
          </div>
          
          <div class="rr-scenarios">
            ${Object.entries(riskReward).map(([level, calc]) => `
              <div class="rr-scenario ${level}">
                <h4>${level.charAt(0).toUpperCase() + level.slice(1)} Strategy</h4>
                
                <div class="rr-grid">
                  <div class="rr-metric">
                    <label>Stop Loss</label>
                    <value>${calc.stopLoss}% ($${calc.stopLossPrice.toFixed(2)})</value>
                  </div>
                  
                  <div class="rr-metric">
                    <label>Take Profit</label>
                    <value>${calc.takeProfit}% ($${calc.takeProfitPrice.toFixed(2)})</value>
                  </div>
                  
                  <div class="rr-metric">
                    <label>Risk Amount</label>
                    <value>$${calc.risk.toFixed(2)}</value>
                  </div>
                  
                  <div class="rr-metric">
                    <label>Reward Amount</label>
                    <value>$${calc.reward.toFixed(2)}</value>
                  </div>
                  
                  <div class="rr-metric highlight">
                    <label>R-Multiple</label>
                    <value>1:${calc.rMultiple.toFixed(2)}</value>
                  </div>
                  
                  <div class="rr-metric">
                    <label>Est. Win Rate</label>
                    <value>${(calc.winRate * 100).toFixed(0)}%</value>
                  </div>
                  
                  <div class="rr-metric ${calc.expectedValue > 0 ? 'positive' : 'negative'}">
                    <label>Expected Value</label>
                    <value>${calc.expectedValue > 0 ? '+' : ''}${(calc.expectedValue * 100).toFixed(1)}%</value>
                  </div>
                  
                  <div class="rr-metric">
                    <label>Kelly %</label>
                    <value>${(calc.kelly * 100).toFixed(1)}%</value>
                  </div>
                </div>
                
                <div class="rr-recommendation">
                  ${this.getRecommendation(calc)}
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="rr-notes">
            <h4>📝 Analysis Notes</h4>
            <ul>
              <li><strong>R-Multiple:</strong> How much you make per dollar risked (1:2 = make $2 for every $1 risked)</li>
              <li><strong>Expected Value:</strong> Average profit/loss per trade over time</li>
              <li><strong>Kelly %:</strong> Optimal position size based on edge and odds</li>
              <li><strong>Win rates:</strong> Conservative estimates based on VIGL pattern history</li>
            </ul>
          </div>
        </div>
        
        <div class="rr-modal-footer">
          <button class="btn-close">Close Analysis</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event handlers
    modal.querySelector('.close-modal').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.querySelector('.btn-close').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }
  
  getRecommendation(calc) {
    if (calc.expectedValue > 0.2 && calc.rMultiple >= 2.0) {
      return `<span class="recommendation excellent">🟢 Excellent setup - Strong positive edge</span>`;
    } else if (calc.expectedValue > 0.1 && calc.rMultiple >= 1.5) {
      return `<span class="recommendation good">🟡 Good setup - Positive expected value</span>`;
    } else if (calc.expectedValue > 0) {
      return `<span class="recommendation fair">🟠 Marginal setup - Small edge</span>`;
    } else {
      return `<span class="recommendation poor">🔴 Poor setup - Negative expected value</span>`;
    }
  }
  
  extractSymbol(row) {
    const symbolEl = row.querySelector('.symbol, .ticker, [data-symbol]') || 
                     row.cells?.[1] || 
                     row.querySelector('td:nth-child(2)');
    return symbolEl?.textContent?.trim() || symbolEl?.dataset?.symbol;
  }
  
  extractPrice(row) {
    const priceEl = row.querySelector('.price, .current-price, [data-price]') ||
                    row.cells?.[3] ||
                    row.querySelector('td:nth-child(4)');
    const priceText = priceEl?.textContent?.trim() || priceEl?.dataset?.price;
    return parseFloat(priceText?.replace(/[$,]/g, '')) || 0;
  }
  
  extractAction(row) {
    const actionEl = row.querySelector('.action, .recommendation, [data-action]') ||
                     row.cells?.[2] ||
                     row.querySelector('td:nth-child(3)');
    return actionEl?.textContent?.trim() || actionEl?.dataset?.action;
  }
}

// Auto-initialize and attach click handlers
document.addEventListener('click', (e) => {
  if (e.target.closest('.rr-expand')) {
    e.preventDefault();
    e.stopPropagation();
    
    const row = e.target.closest('tr, .discovery-row');
    if (!row || !window.riskRewardOverlay) return;
    
    const symbol = window.riskRewardOverlay.extractSymbol(row);
    const price = window.riskRewardOverlay.extractPrice(row);
    
    if (symbol && price) {
      const riskReward = window.riskRewardOverlay.calculateRiskReward(price);
      window.riskRewardOverlay.showDetailedAnalysis(symbol, price, riskReward);
    }
  }
});

// Initialize when enabled
if (typeof window !== 'undefined' && window.localStorage?.getItem('RISK_REWARD_OVERLAY') !== 'false') {
  const riskRewardOverlay = new RiskRewardOverlay();
  window.riskRewardOverlay = riskRewardOverlay;
  
  console.log('📊 Risk/Reward Overlay loaded and ready');
}