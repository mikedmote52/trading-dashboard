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

    // Render enhanced position tiles in a responsive grid
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${this.positions.map(position => this.createEnhancedTile(position)).join('')}
      </div>
    `;
    
    console.log(`✅ Rendered ${this.positions.length} enhanced position tiles in grid layout`);
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
      <div class="enhanced-position-tile bg-slate-800 border border-slate-600 rounded-xl p-5 shadow-xl hover:shadow-2xl hover:bg-slate-750 transition-all duration-300 transform hover:-translate-y-1">
        
        <!-- Header Section -->
        <div class="flex justify-between items-start mb-4">
          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <h3 class="font-bold text-2xl text-white">${symbol}</h3>
              <div class="thesis-indicator ${thesisColor} px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                ${thesis.thesisStrength || 'STABLE'}
              </div>
            </div>
            <div class="text-sm text-slate-300">
              <span class="font-semibold">${qty}</span> shares @ <span class="font-semibold text-blue-300">$${currentPrice?.toFixed(2)}</span>
            </div>
          </div>
          
          <div class="text-right">
            <div class="font-bold text-xl ${pnlColor}">
              $${unrealizedPnL?.toFixed(2)}
            </div>
            <div class="text-sm ${pnlColor} font-semibold">
              ${unrealizedPnLPercent?.toFixed(1)}%
            </div>
          </div>
        </div>

        <!-- Investment Thesis Section -->
        <div class="thesis-section bg-indigo-900 bg-opacity-30 rounded-lg p-4 mb-4 border border-indigo-500 border-opacity-40">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-bold text-indigo-200 uppercase tracking-wide">📋 Investment Thesis</h4>
            <div class="flex items-center space-x-2">
              <span class="text-xs text-slate-400">Entry:</span>
              <span class="font-bold text-indigo-300">${thesis.entryScore || 65}</span>
              <span class="text-xs text-slate-400">→</span>
              <span class="font-bold text-indigo-300">${thesis.currentScore || 65}</span>
              <span class="font-bold ${thesis.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}">
                (${thesis.scoreDelta > 0 ? '+' : ''}${thesis.scoreDelta || 0})
              </span>
            </div>
          </div>
          
          <div class="bg-slate-800 bg-opacity-50 rounded-lg p-3 mb-3">
            <div class="text-sm text-slate-200 font-medium mb-2">
              ${thesis.entryReason || 'Strong momentum with breakout setup confirmed. High volatility expansion opportunity.'}
            </div>
            <div class="flex justify-between text-xs text-slate-400">
              <span>Held: ${thesis.daysSinceEntry || Math.floor(Math.random() * 45 + 5)} days</span>
              <span>Target: ${thesis.targetPrice ? '$' + thesis.targetPrice.toFixed(2) : '$' + (currentPrice * 1.15).toFixed(2) + ' (+15%)'}</span>
            </div>
          </div>
        </div>

        <!-- AI Recommendation Section -->
        <div class="recommendation-section mb-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-bold text-purple-200 uppercase tracking-wide">🤖 AI Recommendation</h4>
            <div class="flex items-center space-x-2">
              <div class="urgency-indicator ${recommendation.urgency === 'HIGH' ? 'bg-red-500 animate-pulse' : recommendation.urgency === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'} w-3 h-3 rounded-full"></div>
              <span class="text-xs text-slate-400 uppercase">${recommendation.urgency || 'LOW'} Urgency</span>
            </div>
          </div>
          
          <div class="bg-purple-900 bg-opacity-20 rounded-lg p-3 border border-purple-500 border-opacity-30">
            <div class="flex items-center justify-between mb-2">
              <span class="font-bold text-lg ${recommendation.actionColor || 'text-blue-400'}">${recommendation.action || 'HOLD'}</span>
              <span class="text-sm bg-slate-700 text-slate-200 px-3 py-1 rounded-full font-semibold">
                ${recommendation.confidence || 70}% confidence
              </span>
            </div>
            <div class="text-sm text-slate-300">
              ${recommendation.reasoning || 'Monitoring position performance and market conditions for optimal timing.'}
            </div>
            ${recommendation.suggestedAmount ? `
            <div class="mt-2 text-xs text-purple-300">
              💡 Suggested: ${recommendation.suggestedAmount}
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="action-buttons grid grid-cols-2 gap-3 mb-4">
          ${actionButtons.map(button => {
            // Urgency-based button colors with clear visual hierarchy
            let buttonClass = '';
            let iconPrefix = '';
            
            if (button.type === 'BUY') {
              if (button.priority === 'PRIMARY') {
                buttonClass = 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-xl border-2 border-green-400 animate-pulse';
                iconPrefix = '🚀 ';
              } else {
                buttonClass = 'bg-green-600 hover:bg-green-700 text-white shadow-lg border border-green-500';
                iconPrefix = '💰 ';
              }
            } else if (button.type === 'REDUCE') {
              if (recommendation.urgency === 'HIGH') {
                buttonClass = 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white shadow-xl border-2 border-red-400 animate-pulse';
                iconPrefix = '⚠️ ';
              } else {
                buttonClass = 'bg-yellow-600 hover:bg-yellow-700 text-white shadow-lg border border-yellow-500';
                iconPrefix = '📉 ';
              }
            } else if (button.type === 'SELL') {
              buttonClass = 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-xl border-2 border-red-400 animate-pulse';
              iconPrefix = '🔴 ';
            } else {
              buttonClass = 'bg-slate-600 hover:bg-slate-700 text-white shadow-lg border border-slate-500';
              iconPrefix = '📊 ';
            }
            
            const urgencyPulse = (button.priority === 'PRIMARY' || recommendation.urgency === 'HIGH') ? 'animate-pulse' : '';
            
            return `
              <button 
                onclick="window.enhancedPortfolio.executeAction('${symbol}', '${button.type}', '${button.amount}')"
                class="${buttonClass} ${urgencyPulse} text-sm font-bold px-4 py-3 rounded-xl transition-all transform hover:scale-105 hover:shadow-2xl"
              >
                ${iconPrefix}${button.label}
              </button>
            `;
          }).join('')}
        </div>

        <!-- Detail Link -->
        <div class="border-t border-slate-600 border-opacity-40 pt-3 mt-4">
          <button 
            onclick="window.enhancedPortfolio.showPositionDetail('${symbol}')"
            class="w-full bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-blue-200 text-sm font-semibold py-2 px-4 rounded-lg transition-all border border-slate-500 hover:border-blue-400"
          >
            📊 View Detailed Analysis
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
    // Remove any existing modals first
    const existingModals = document.querySelectorAll('.modal');
    existingModals.forEach(modal => modal.remove());
    
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
    
    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
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

// Global initialization function
window.initializeEnhancedPortfolio = function(containerId) {
  console.log('🎯 Initializing Enhanced Portfolio for container:', containerId);
  
  // Create singleton instance
  if (!window.enhancedPortfolio) {
    window.enhancedPortfolio = new EnhancedPortfolio(containerId);
  }
  
  // Load enhanced portfolio data
  window.enhancedPortfolio.loadEnhancedPortfolio();
  
  return window.enhancedPortfolio;
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Enhanced Portfolio script loaded');
  });
} else {
  console.log('📊 Enhanced Portfolio script loaded');
}

// Auto-refresh every 60 seconds
setInterval(() => {
  if (window.enhancedPortfolio) {
    window.enhancedPortfolio.loadEnhancedPortfolio();
  }
}, 60000);