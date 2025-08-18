// One-Click Trading Component - Feature 1: Paper trading with position sizing
class OneClickTrading {
  constructor() {
    this.isEnabled = true;
    this.defaultAmount = 100;
    this.riskSettings = {
      stopLoss: 10,    // 10% stop loss
      takeProfit: 25   // 25% take profit
    };
    
    this.init();
  }
  
  init() {
    console.log('🎯 One-Click Trading initialized');
    
    // Add trading buttons to each discovery row
    this.addTradingButtons();
    
    // Listen for discovery updates to refresh buttons
    document.addEventListener('DOMContentLoaded', () => {
      this.addTradingButtons();
    });
  }
  
  addTradingButtons() {
    // Find all discovery rows in the table
    const discoveryRows = document.querySelectorAll('.discovery-row, tr[data-symbol]');
    
    discoveryRows.forEach(row => {
      const symbol = this.extractSymbol(row);
      const price = this.extractPrice(row);
      const action = this.extractAction(row);
      
      if (symbol && price && action === 'BUY' && !row.querySelector('.one-click-trade-btn')) {
        this.addTradingButton(row, symbol, price);
      }
    });
  }
  
  extractSymbol(row) {
    // Try multiple selectors to find symbol
    const symbolEl = row.querySelector('.symbol, .ticker, [data-symbol]') || 
                     row.cells?.[1] || 
                     row.querySelector('td:nth-child(2)');
    return symbolEl?.textContent?.trim() || symbolEl?.dataset?.symbol;
  }
  
  extractPrice(row) {
    // Try multiple selectors to find price
    const priceEl = row.querySelector('.price, .current-price, [data-price]') ||
                    row.cells?.[3] ||
                    row.querySelector('td:nth-child(4)');
    const priceText = priceEl?.textContent?.trim() || priceEl?.dataset?.price;
    return parseFloat(priceText?.replace(/[$,]/g, '')) || 0;
  }
  
  extractAction(row) {
    // Try multiple selectors to find action
    const actionEl = row.querySelector('.action, .recommendation, [data-action]') ||
                     row.cells?.[2] ||
                     row.querySelector('td:nth-child(3)');
    return actionEl?.textContent?.trim() || actionEl?.dataset?.action;
  }
  
  addTradingButton(row, symbol, price) {
    // Create trading button container
    const tradingCell = document.createElement('td');
    tradingCell.className = 'trading-cell';
    
    // Quick buy button
    const buyButton = document.createElement('button');
    buyButton.className = 'one-click-trade-btn btn-buy';
    buyButton.innerHTML = `
      <span class="trade-icon">🎯</span>
      <span class="trade-text">Buy $${this.defaultAmount}</span>
    `;
    buyButton.title = `Paper trade ${symbol} with $${this.defaultAmount} (${this.riskSettings.stopLoss}% SL, ${this.riskSettings.takeProfit}% TP)`;
    
    buyButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.executeTrade(symbol, price, this.defaultAmount);
    });
    
    // Advanced options button
    const optionsButton = document.createElement('button');
    optionsButton.className = 'trade-options-btn';
    optionsButton.innerHTML = '⚙️';
    optionsButton.title = 'Advanced trading options';
    
    optionsButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showAdvancedOptions(symbol, price);
    });
    
    tradingCell.appendChild(buyButton);
    tradingCell.appendChild(optionsButton);
    
    // Add to row
    if (row.tagName === 'TR') {
      row.appendChild(tradingCell);
    } else {
      // For div-based layouts, append differently
      row.appendChild(tradingCell);
    }
  }
  
  async executeTrade(symbol, price, amount) {
    console.log(`🎯 Executing one-click trade: ${symbol} at $${price} for $${amount}`);
    
    // Show loading state
    const button = document.querySelector(`[title*="${symbol}"]`);
    if (button) {
      const originalText = button.innerHTML;
      button.innerHTML = `<span class="trade-icon">⏳</span><span class="trade-text">Placing...</span>`;
      button.disabled = true;
    }
    
    try {
      const response = await fetch('/api/discoveries/buy100', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol,
          price: price,
          stopLossPercent: this.riskSettings.stopLoss,
          takeProfitPercent: this.riskSettings.takeProfit
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showTradeSuccess(result);
        
        // Update button to show success
        if (button) {
          button.innerHTML = `<span class="trade-icon">✅</span><span class="trade-text">Placed</span>`;
          button.className = 'one-click-trade-btn btn-success';
          
          setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
            button.className = 'one-click-trade-btn btn-buy';
          }, 3000);
        }
        
      } else {
        throw new Error(result.error || 'Trade failed');
      }
      
    } catch (error) {
      console.error('❌ Trade failed:', error);
      this.showTradeError(error.message);
      
      // Reset button
      if (button) {
        button.innerHTML = originalText;
        button.disabled = false;
        button.className = 'one-click-trade-btn btn-error';
        
        setTimeout(() => {
          button.className = 'one-click-trade-btn btn-buy';
        }, 3000);
      }
    }
  }
  
  showAdvancedOptions(symbol, price) {
    // Create modal for advanced trading options
    const modal = document.createElement('div');
    modal.className = 'trade-modal-overlay';
    modal.innerHTML = `
      <div class="trade-modal">
        <div class="trade-modal-header">
          <h3>Advanced Trade: ${symbol}</h3>
          <button class="close-modal">&times;</button>
        </div>
        
        <div class="trade-modal-body">
          <div class="price-info">
            <span class="current-price">Current: $${price.toFixed(2)}</span>
          </div>
          
          <div class="form-group">
            <label for="amount">Investment Amount ($)</label>
            <input type="number" id="amount" value="${this.defaultAmount}" min="10" max="10000" step="10">
          </div>
          
          <div class="form-group">
            <label for="stopLoss">Stop Loss (%)</label>
            <input type="number" id="stopLoss" value="${this.riskSettings.stopLoss}" min="1" max="50" step="1">
          </div>
          
          <div class="form-group">
            <label for="takeProfit">Take Profit (%)</label>
            <input type="number" id="takeProfit" value="${this.riskSettings.takeProfit}" min="5" max="200" step="5">
          </div>
          
          <div class="trade-preview">
            <div class="preview-line">
              <span>Shares: </span>
              <span id="shareCount">${Math.floor(this.defaultAmount / price)}</span>
            </div>
            <div class="preview-line">
              <span>Stop Loss: </span>
              <span id="stopPrice">$${(price * (1 - this.riskSettings.stopLoss/100)).toFixed(2)}</span>
            </div>
            <div class="preview-line">
              <span>Take Profit: </span>
              <span id="profitPrice">$${(price * (1 + this.riskSettings.takeProfit/100)).toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div class="trade-modal-footer">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-execute">Execute Trade</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Update calculations when inputs change
    const updateCalculations = () => {
      const amount = parseFloat(document.getElementById('amount').value) || 0;
      const stopLoss = parseFloat(document.getElementById('stopLoss').value) || 0;
      const takeProfit = parseFloat(document.getElementById('takeProfit').value) || 0;
      
      const shares = Math.floor(amount / price);
      const stopPrice = price * (1 - stopLoss/100);
      const profitPrice = price * (1 + takeProfit/100);
      
      document.getElementById('shareCount').textContent = shares;
      document.getElementById('stopPrice').textContent = `$${stopPrice.toFixed(2)}`;
      document.getElementById('profitPrice').textContent = `$${profitPrice.toFixed(2)}`;
    };
    
    modal.querySelector('#amount').addEventListener('input', updateCalculations);
    modal.querySelector('#stopLoss').addEventListener('input', updateCalculations);
    modal.querySelector('#takeProfit').addEventListener('input', updateCalculations);
    
    // Modal event handlers
    modal.querySelector('.close-modal').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.querySelector('.btn-cancel').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.querySelector('.btn-execute').addEventListener('click', () => {
      const amount = parseFloat(document.getElementById('amount').value);
      const stopLoss = parseFloat(document.getElementById('stopLoss').value);
      const takeProfit = parseFloat(document.getElementById('takeProfit').value);
      
      // Update risk settings for this trade
      const tradeSettings = { stopLoss, takeProfit };
      
      document.body.removeChild(modal);
      this.executeCustomTrade(symbol, price, amount, tradeSettings);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }
  
  async executeCustomTrade(symbol, price, amount, settings) {
    console.log(`🎯 Executing custom trade: ${symbol} at $${price} for $${amount}`, settings);
    
    try {
      const response = await fetch('/api/discoveries/buy100', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol,
          price: price,
          stopLossPercent: settings.stopLoss,
          takeProfitPercent: settings.takeProfit,
          amount: amount
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showTradeSuccess(result);
      } else {
        throw new Error(result.error || 'Trade failed');
      }
      
    } catch (error) {
      console.error('❌ Custom trade failed:', error);
      this.showTradeError(error.message);
    }
  }
  
  showTradeSuccess(result) {
    const notification = document.createElement('div');
    notification.className = 'trade-notification success';
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">✅</span>
        <div class="notification-details">
          <div class="notification-title">Trade Executed Successfully</div>
          <div class="notification-info">
            ${result.symbol}: ${result.quantity} shares at $${result.price}
            <br>Order ID: ${result.orderId}
            <br>Stop: $${result.stopLossPrice} | Target: $${result.takeProfitPrice}
          </div>
        </div>
        <button class="notification-close">&times;</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    }, 5000);
    
    // Close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    });
  }
  
  showTradeError(errorMessage) {
    const notification = document.createElement('div');
    notification.className = 'trade-notification error';
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">❌</span>
        <div class="notification-details">
          <div class="notification-title">Trade Failed</div>
          <div class="notification-info">${errorMessage}</div>
        </div>
        <button class="notification-close">&times;</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    }, 5000);
    
    // Close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    });
  }
}

// Initialize when enabled
if (typeof window !== 'undefined' && window.localStorage?.getItem('ONE_CLICK_TRADING') !== 'false') {
  const oneClickTrading = new OneClickTrading();
  window.oneClickTrading = oneClickTrading;
  
  console.log('🎯 One-Click Trading loaded and ready');
}