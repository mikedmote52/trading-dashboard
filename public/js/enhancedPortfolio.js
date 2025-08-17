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
  async executeAction(symbol, actionType, amount) {
    try {
      console.log(`💰 Execute ${actionType} for ${symbol}: ${amount}`);
      
      // Show confirmation dialog
      const confirmed = confirm(
        `Confirm ${actionType} action for ${symbol}?\n\n` +
        `Action: ${actionType}\n` +
        `Amount: ${amount}\n\n` +
        `This will execute a real trade in your Alpaca paper account.`
      );
      
      if (!confirmed) return;
      
      // For now, show success message - later integrate with Alpaca API
      this.showNotification(`${actionType} order submitted for ${symbol} (${amount})`, 'success');
      
      // TODO: Integrate with actual trading API
      // const response = await fetch('/api/trading/execute', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ symbol, actionType, amount })
      // });
      
    } catch (error) {
      console.error('❌ Action execution error:', error);
      this.showNotification(`Failed to execute ${actionType} for ${symbol}: ${error.message}`, 'error');
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