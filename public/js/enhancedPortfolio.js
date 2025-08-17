/**
 * Enhanced Portfolio Component
 * Intelligent position management with thesis tracking and recommendations
 */

class EnhancedPortfolio {
  constructor(containerId = 'portfolio-positions') {
    this.containerId = containerId;
    this.positions = [];
    this.lastUpdate = null;
    this.isLoading = false;
    
    // Bind methods
    this.loadEnhancedPortfolio = this.loadEnhancedPortfolio.bind(this);
    this.executeAction = this.executeAction.bind(this);
    this.showPositionDetail = this.showPositionDetail.bind(this);
  }

  /**
   * Load enhanced portfolio data with thesis and recommendations
   */
  async loadEnhancedPortfolio() {
    if (this.isLoading) return;
    
    try {
      this.isLoading = true;
      const container = document.getElementById(this.containerId);
      if (container) {
        container.classList.add('loading');
      }
      
      console.log('📊 Loading enhanced portfolio...');
      
      const response = await fetch('/api/enhanced-portfolio/enhanced');
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load enhanced portfolio');
      }
      
      this.positions = data.portfolio.positions || [];
      this.analysis = data.portfolio.analysis || {};
      this.lastUpdate = new Date();
      
      console.log(`✅ Enhanced portfolio loaded: ${this.positions.length} positions`);
      
      this.render();
      this.updatePortfolioSummary();
      
    } catch (error) {
      console.error('❌ Enhanced portfolio load error:', error);
      this.showError(error.message);
    } finally {
      this.isLoading = false;
      const container = document.getElementById(this.containerId);
      if (container) {
        container.classList.remove('loading');
      }
    }
  }

  /**
   * Render enhanced portfolio tiles
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    if (this.positions.length === 0) {
      container.innerHTML = '<div class="text-center py-8 text-blue-300">No positions found</div>';
      return;
    }

    container.innerHTML = this.positions.map(position => this.createEnhancedTile(position)).join('');
  }

  /**
   * Create enhanced position tile with thesis and recommendations
   */
  createEnhancedTile(position) {
    const { 
      symbol, 
      qty, 
      currentPrice, 
      unrealizedPnL, 
      unrealizedPnLPercent,
      thesis = {},
      recommendation = {},
      actionButtons = []
    } = position;

    const pnlColor = unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400';
    const pnlBgColor = unrealizedPnL >= 0 ? 'bg-green-900 bg-opacity-20' : 'bg-red-900 bg-opacity-20';
    
    // Thesis strength indicator
    const strengthColor = {
      'STRENGTHENING': 'text-green-400 bg-green-900 bg-opacity-30',
      'STABLE': 'text-blue-400 bg-blue-900 bg-opacity-30',
      'NEUTRAL': 'text-yellow-400 bg-yellow-900 bg-opacity-30',
      'WEAKENING': 'text-red-400 bg-red-900 bg-opacity-30'
    };

    const thesisColor = strengthColor[thesis.thesisStrength] || strengthColor['NEUTRAL'];
    
    return `
      <div class="enhanced-position-tile bg-white bg-opacity-8 border border-white border-opacity-15 rounded-lg p-4 mb-4 hover:bg-opacity-12 transition-all duration-300">
        
        <!-- Header Section -->
        <div class="flex justify-between items-start mb-3">
          <div class="flex-1">
            <div class="flex items-center space-x-3">
              <h3 class="font-bold text-xl text-white">${symbol}</h3>
              <div class="thesis-indicator ${thesisColor} px-2 py-1 rounded-md text-xs font-medium">
                ${thesis.thesisStrength || 'STABLE'}
              </div>
            </div>
            <div class="text-sm text-blue-200 mt-1">
              ${qty} shares @ $${currentPrice?.toFixed(2)}
            </div>
          </div>
          
          <div class="text-right">
            <div class="font-bold text-lg ${pnlColor}">
              $${unrealizedPnL?.toFixed(2)}
            </div>
            <div class="text-sm ${pnlColor}">
              ${unrealizedPnLPercent?.toFixed(1)}%
            </div>
          </div>
        </div>

        <!-- Thesis Section -->
        ${thesis.entryReason ? `
        <div class="thesis-section bg-blue-900 bg-opacity-20 rounded-lg p-3 mb-3 border border-blue-700 border-opacity-30">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1">
              <div class="text-xs font-medium text-blue-200 mb-1">Investment Thesis</div>
              <div class="text-sm text-blue-100">${thesis.entryReason}</div>
            </div>
            <div class="text-right text-xs text-blue-300">
              <div>Entry: ${thesis.entryScore || 'N/A'}</div>
              <div>Current: ${thesis.currentScore || 'N/A'}</div>
              <div class="${thesis.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}">
                ${thesis.scoreDelta > 0 ? '+' : ''}${thesis.scoreDelta || 0}
              </div>
            </div>
          </div>
          
          ${thesis.daysSinceEntry ? `
          <div class="text-xs text-blue-300">
            Held for ${thesis.daysSinceEntry} days
          </div>
          ` : ''}
        </div>
        ` : ''}

        <!-- Recommendation Section -->
        ${recommendation.action ? `
        <div class="recommendation-section mb-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2">
              <span class="text-xs font-medium text-gray-300">Recommendation:</span>
              <span class="font-bold ${recommendation.actionColor || 'text-blue-400'}">${recommendation.action}</span>
              <span class="text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded">
                ${recommendation.confidence}% confidence
              </span>
            </div>
            <div class="urgency-indicator ${recommendation.urgencyStyle || 'border-gray-500'} border-2 rounded-full w-3 h-3"></div>
          </div>
          <div class="text-sm text-gray-300 italic">
            ${recommendation.reasoning}
          </div>
        </div>
        ` : ''}

        <!-- Action Buttons -->
        <div class="action-buttons flex space-x-2 mb-3">
          ${actionButtons.map(button => `
            <button 
              onclick="window.enhancedPortfolio.executeAction('${symbol}', '${button.type}', '${button.amount}')"
              class="${button.color} text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all transform hover:scale-105 ${button.priority === 'PRIMARY' ? 'ring-2 ring-white ring-opacity-30' : ''}"
            >
              ${button.label}
            </button>
          `).join('')}
        </div>

        <!-- Detail Link -->
        <div class="border-t border-gray-600 border-opacity-30 pt-3">
          <button 
            onclick="window.enhancedPortfolio.showPositionDetail('${symbol}')"
            class="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
          >
            📊 View Detailed Analysis →
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Execute trading action
   */
  async executeAction(symbol, actionType, suggestedAmount) {
    try {
      console.log(`💰 Execute ${actionType} for ${symbol}: ${suggestedAmount}`);
      
      const position = this.positions.find(p => p.symbol === symbol);
      if (!position) return;
      
      // Show interactive trading modal
      this.showTradingModal(symbol, actionType, suggestedAmount, position);
      
    } catch (error) {
      console.error('❌ Action execution error:', error);
      this.showNotification(`Failed to execute ${actionType} for ${symbol}: ${error.message}`, 'error');
    }
  }

  /**
   * Show interactive trading modal with amount selection and stop loss
   */
  showTradingModal(symbol, actionType, suggestedAmount, position) {
    const currentPrice = position.currentPrice;
    const isBuy = actionType.includes('BUY');
    const isReduce = actionType.includes('REDUCE');
    
    const modalContent = `
      <div class="trading-modal max-w-md mx-auto">
        <h2 class="text-2xl font-bold mb-4">${actionType} ${symbol}</h2>
        
        <div class="space-y-4">
          <!-- Current Position Info -->
          <div class="bg-gray-800 rounded-lg p-3">
            <div class="flex justify-between text-sm">
              <span>Current Price:</span>
              <span class="font-bold">$${currentPrice?.toFixed(2)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span>Current Shares:</span>
              <span class="font-bold">${position.qty}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span>P&L:</span>
              <span class="font-bold ${position.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}">
                $${position.unrealizedPnL?.toFixed(2)} (${position.unrealizedPnLPercent?.toFixed(1)}%)
              </span>
            </div>
          </div>

          <!-- Order Type Selection -->
          <div>
            <label class="block text-sm font-medium mb-2">Order Type</label>
            <select id="orderType" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
              <option value="market">Market Order (Execute Immediately)</option>
              <option value="limit">Limit Order (Set Price)</option>
              ${!isBuy ? '<option value="stop_loss">Stop Loss Order</option>' : ''}
            </select>
          </div>

          <!-- Amount Selection -->
          <div>
            <label class="block text-sm font-medium mb-2">Amount</label>
            <div class="flex space-x-2 mb-2">
              <button onclick="document.getElementById('amountType').value='dollars'; window.enhancedPortfolio.updateAmountField('${symbol}', '${currentPrice}')" 
                      class="px-3 py-1 bg-blue-600 rounded text-xs">$ Amount</button>
              <button onclick="document.getElementById('amountType').value='shares'; window.enhancedPortfolio.updateAmountField('${symbol}', '${currentPrice}')" 
                      class="px-3 py-1 bg-gray-600 rounded text-xs">Shares</button>
              ${isReduce ? '<button onclick="document.getElementById(\'amountType\').value=\'percent\'; window.enhancedPortfolio.updateAmountField(\'' + symbol + '\', \'' + currentPrice + '\')" class="px-3 py-1 bg-yellow-600 rounded text-xs">% of Position</button>' : ''}
            </div>
            <input type="hidden" id="amountType" value="dollars">
            <input type="number" id="tradeAmount" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" 
                   placeholder="Enter amount" value="${isBuy ? '500' : isReduce ? '25' : '100'}" step="0.01">
            <div id="shareCalculation" class="text-xs text-gray-400 mt-1"></div>
          </div>

          <!-- Limit Price (if limit order) -->
          <div id="limitPriceSection" class="hidden">
            <label class="block text-sm font-medium mb-2">Limit Price</label>
            <input type="number" id="limitPrice" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" 
                   placeholder="$${currentPrice?.toFixed(2)}" value="${currentPrice?.toFixed(2)}" step="0.01">
          </div>

          <!-- Stop Loss (for buy orders) -->
          ${isBuy ? `
          <div>
            <label class="block text-sm font-medium mb-2">
              <input type="checkbox" id="addStopLoss" class="mr-2"> Add Stop Loss
            </label>
            <div id="stopLossSection" class="hidden">
              <input type="number" id="stopLossPrice" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" 
                     placeholder="Stop loss price" value="${(currentPrice * 0.9)?.toFixed(2)}" step="0.01">
              <div class="text-xs text-gray-400 mt-1">Suggested: 10% below current price</div>
            </div>
          </div>
          ` : ''}

          <!-- Action Buttons -->
          <div class="flex space-x-3 pt-4">
            <button onclick="window.enhancedPortfolio.submitTrade('${symbol}', '${actionType}')" 
                    class="flex-1 ${isBuy ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} text-white font-bold py-3 rounded-lg">
              ${actionType}
            </button>
            <button onclick="this.closest('.modal').remove()" 
                    class="px-6 bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      </div>

      <script>
        // Show/hide limit price section
        document.getElementById('orderType').addEventListener('change', function() {
          const limitSection = document.getElementById('limitPriceSection');
          if (this.value === 'limit') {
            limitSection.classList.remove('hidden');
          } else {
            limitSection.classList.add('hidden');
          }
        });

        // Show/hide stop loss section
        const stopLossCheckbox = document.getElementById('addStopLoss');
        if (stopLossCheckbox) {
          stopLossCheckbox.addEventListener('change', function() {
            const stopLossSection = document.getElementById('stopLossSection');
            if (this.checked) {
              stopLossSection.classList.remove('hidden');
            } else {
              stopLossSection.classList.add('hidden');
            }
          });
        }

        // Update share calculation when amount changes
        document.getElementById('tradeAmount').addEventListener('input', function() {
          window.enhancedPortfolio.updateAmountField('${symbol}', '${currentPrice}');
        });

        // Initial calculation
        window.enhancedPortfolio.updateAmountField('${symbol}', '${currentPrice}');
      </script>
    `;
    
    this.showModal(modalContent);
  }

  /**
   * Update amount field calculations
   */
  updateAmountField(symbol, currentPrice) {
    const amountType = document.getElementById('amountType')?.value;
    const tradeAmount = parseFloat(document.getElementById('tradeAmount')?.value) || 0;
    const calculationDiv = document.getElementById('shareCalculation');
    
    if (!calculationDiv) return;
    
    const position = this.positions.find(p => p.symbol === symbol);
    if (!position) return;
    
    let calculationText = '';
    
    if (amountType === 'dollars') {
      const shares = Math.floor(tradeAmount / currentPrice);
      calculationText = `≈ ${shares} shares at $${currentPrice}`;
    } else if (amountType === 'shares') {
      const dollarAmount = tradeAmount * currentPrice;
      calculationText = `≈ $${dollarAmount.toFixed(2)} at $${currentPrice}`;
    } else if (amountType === 'percent') {
      const sharesToSell = Math.floor((tradeAmount / 100) * position.qty);
      const dollarAmount = sharesToSell * currentPrice;
      calculationText = `≈ ${sharesToSell} shares = $${dollarAmount.toFixed(2)}`;
    }
    
    calculationDiv.textContent = calculationText;
  }

  /**
   * Submit trade order
   */
  async submitTrade(symbol, actionType) {
    try {
      const orderType = document.getElementById('orderType')?.value;
      const amountType = document.getElementById('amountType')?.value;
      const tradeAmount = parseFloat(document.getElementById('tradeAmount')?.value) || 0;
      const limitPrice = parseFloat(document.getElementById('limitPrice')?.value);
      const addStopLoss = document.getElementById('addStopLoss')?.checked;
      const stopLossPrice = parseFloat(document.getElementById('stopLossPrice')?.value);
      
      if (!tradeAmount || tradeAmount <= 0) {
        this.showNotification('Please enter a valid amount', 'error');
        return;
      }
      
      const position = this.positions.find(p => p.symbol === symbol);
      if (!position) return;
      
      // Calculate shares
      let shares = 0;
      if (amountType === 'dollars') {
        shares = Math.floor(tradeAmount / position.currentPrice);
      } else if (amountType === 'shares') {
        shares = Math.floor(tradeAmount);
      } else if (amountType === 'percent') {
        shares = Math.floor((tradeAmount / 100) * position.qty);
      }
      
      if (shares <= 0) {
        this.showNotification('Invalid share quantity calculated', 'error');
        return;
      }
      
      // Prepare order data
      const orderData = {
        symbol,
        actionType,
        orderType,
        shares,
        dollarAmount: shares * position.currentPrice,
        limitPrice: orderType === 'limit' ? limitPrice : null,
        stopLoss: addStopLoss ? stopLossPrice : null
      };
      
      // Show confirmation
      const confirmMessage = 
        `Confirm ${actionType} Order:\n\n` +
        `Symbol: ${symbol}\n` +
        `Shares: ${shares}\n` +
        `Estimated Cost: $${orderData.dollarAmount.toFixed(2)}\n` +
        `Order Type: ${orderType.toUpperCase()}\n` +
        (orderData.limitPrice ? `Limit Price: $${orderData.limitPrice}\n` : '') +
        (orderData.stopLoss ? `Stop Loss: $${orderData.stopLoss}\n` : '') +
        `\nThis will execute in your Alpaca paper account.`;
      
      if (!confirm(confirmMessage)) return;
      
      // Close modal
      document.querySelector('.modal')?.remove();
      
      // For now, show success - later integrate with Alpaca API
      this.showNotification(
        `${actionType} order submitted: ${shares} shares of ${symbol} for $${orderData.dollarAmount.toFixed(2)}`, 
        'success'
      );
      
      // TODO: Integrate with actual Alpaca trading API
      console.log('Order data:', orderData);
      
      // Refresh portfolio after a delay
      setTimeout(() => {
        this.loadEnhancedPortfolio();
      }, 2000);
      
    } catch (error) {
      console.error('❌ Trade submission error:', error);
      this.showNotification(`Failed to submit trade: ${error.message}`, 'error');
    }
  }

  /**
   * Show detailed position analysis modal
   */
  showPositionDetail(symbol) {
    const position = this.positions.find(p => p.symbol === symbol);
    if (!position) return;
    
    console.log('📊 Showing detailed analysis for', symbol);
    
    // Create modal content
    const modalContent = `
      <div class="position-detail-modal">
        <h2 class="text-2xl font-bold mb-4">${symbol} - Detailed Analysis</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Position Details -->
          <div class="bg-gray-800 rounded-lg p-4">
            <h3 class="font-bold mb-3">Position Details</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span>Shares:</span>
                <span>${position.qty}</span>
              </div>
              <div class="flex justify-between">
                <span>Current Price:</span>
                <span>$${position.currentPrice?.toFixed(2)}</span>
              </div>
              <div class="flex justify-between">
                <span>Market Value:</span>
                <span>$${(position.qty * position.currentPrice)?.toFixed(2)}</span>
              </div>
              <div class="flex justify-between">
                <span>P&L:</span>
                <span class="${position.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}">
                  $${position.unrealizedPnL?.toFixed(2)} (${position.unrealizedPnLPercent?.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
          
          <!-- Thesis Analysis -->
          <div class="bg-gray-800 rounded-lg p-4">
            <h3 class="font-bold mb-3">Thesis Performance</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span>Entry Score:</span>
                <span>${position.thesis?.entryScore || 'N/A'}</span>
              </div>
              <div class="flex justify-between">
                <span>Current Score:</span>
                <span>${position.thesis?.currentScore || 'N/A'}</span>
              </div>
              <div class="flex justify-between">
                <span>Score Delta:</span>
                <span class="${(position.thesis?.scoreDelta || 0) >= 0 ? 'text-green-400' : 'text-red-400'}">
                  ${(position.thesis?.scoreDelta || 0) > 0 ? '+' : ''}${position.thesis?.scoreDelta || 0}
                </span>
              </div>
              <div class="flex justify-between">
                <span>Days Held:</span>
                <span>${position.thesis?.daysSinceEntry || 0}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="mt-6 text-center">
          <button onclick="this.closest('.modal').remove()" class="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-lg">
            Close
          </button>
        </div>
      </div>
    `;
    
    this.showModal(modalContent);
  }

  /**
   * Update portfolio summary in header
   */
  updatePortfolioSummary() {
    const summaryContainer = document.getElementById('portfolio-stats');
    if (!summaryContainer || !this.analysis) return;

    const { recommendations = {}, thesesSummary = {} } = this.analysis;
    
    summaryContainer.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div class="text-center">
          <div class="font-bold text-blue-400">${this.positions.length}</div>
          <div class="text-xs text-gray-400">Positions</div>
        </div>
        <div class="text-center">
          <div class="font-bold text-green-400">${thesesSummary.strengthening || 0}</div>
          <div class="text-xs text-gray-400">Strengthening</div>
        </div>
        <div class="text-center">
          <div class="font-bold text-red-400">${thesesSummary.weakening || 0}</div>
          <div class="text-xs text-gray-400">Weakening</div>
        </div>
        <div class="text-center">
          <div class="font-bold text-yellow-400">${recommendations.highUrgencyCount || 0}</div>
          <div class="text-xs text-gray-400">Need Attention</div>
        </div>
      </div>
    `;
  }

  /**
   * Show notification message
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
      type === 'success' ? 'bg-green-600' : 
      type === 'error' ? 'bg-red-600' : 'bg-blue-600'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  /**
   * Show modal dialog
   */
  showModal(content) {
    const modal = document.createElement('div');
    modal.className = 'modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-900 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        ${content}
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.innerHTML = `
        <div class="text-red-400 text-center py-8">
          <div class="text-4xl mb-2">❌</div>
          <div class="font-bold mb-2">Error Loading Portfolio</div>
          <div class="text-sm">${message}</div>
          <button onclick="window.enhancedPortfolio.loadEnhancedPortfolio()" 
                  class="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">
            Try Again
          </button>
        </div>
      `;
    }
  }
}

// Global initialization
window.initializeEnhancedPortfolio = function(containerId) {
  window.enhancedPortfolio = new EnhancedPortfolio(containerId);
  window.enhancedPortfolio.loadEnhancedPortfolio();
  return window.enhancedPortfolio;
};

// Auto-refresh every 60 seconds
setInterval(() => {
  if (window.enhancedPortfolio) {
    window.enhancedPortfolio.loadEnhancedPortfolio();
  }
}, 60000);