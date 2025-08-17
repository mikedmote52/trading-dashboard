/**
 * AlphaStack Screener Component for Trading Dashboard
 * Replaces VIGL Pattern Discovery with comprehensive multi-factor screening
 */

class AlphaStackScreener {
  constructor(containerId = 'alphastack-screener-container') {
    this.containerId = containerId;
    this.data = [];
    this.isLoading = false;
    this.lastUpdate = null;
    
    // Bind methods
    this.loadData = this.loadData.bind(this);
    this.runScan = this.runScan.bind(this);
    this.renderResults = this.renderResults.bind(this);
  }
  
  /**
   * Initialize the AlphaStack screener in the dashboard
   */
  init() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`AlphaStack: Container ${this.containerId} not found`);
      return;
    }
    
    // Create the screener interface
    container.innerHTML = this.createScreenerHTML();
    
    // Bind event listeners
    this.bindEventListeners();
    
    // Load initial data
    this.loadData();
    
    console.log('✅ AlphaStack Screener initialized');
  }
  
  /**
   * Create the HTML structure for the screener
   */
  createScreenerHTML() {
    return `
      <div class="alphastack-screener">
        <div class="screener-header">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h2 class="text-xl font-bold mb-1 flex items-center">
                🎯 AlphaStack Screener
                <span class="ml-2 text-xs px-2 py-1 rounded bg-blue-700 text-blue-200">LIVE</span>
              </h2>
              <p class="text-blue-200 text-xs">Advanced screening with sentiment, technical, and short interest analysis</p>
            </div>
            <div class="flex space-x-2">
              <button id="alphastack-refresh" class="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg font-medium transition-colors flex items-center">
                <span id="alphastack-refresh-icon">🔄</span>
                <span class="ml-1 text-sm">Refresh Data</span>
              </button>
              <button id="alphastack-scan" class="bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg font-medium transition-colors flex items-center">
                <span id="alphastack-scan-icon">🚀</span>
                <span class="ml-1 text-sm">Run Scan</span>
              </button>
            </div>
          </div>
        </div>
        
        <div id="alphastack-results" class="screener-results">
          <div class="loading-state text-center py-8">
            <div class="text-4xl mb-3">📊</div>
            <div class="text-lg font-bold mb-2">Loading AlphaStack Data...</div>
            <div class="text-blue-200 text-sm">Fetching multi-factor screening results</div>
          </div>
        </div>
        
        <div id="alphastack-stats" class="screener-stats mt-4 text-xs text-blue-300 text-center">
          <!-- Stats will be populated here -->
        </div>
      </div>
    `;
  }
  
  /**
   * Bind event listeners for the screener controls
   */
  bindEventListeners() {
    const refreshBtn = document.getElementById('alphastack-refresh');
    const scanBtn = document.getElementById('alphastack-scan');
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', this.loadData);
    }
    
    if (scanBtn) {
      scanBtn.addEventListener('click', this.runScan);
    }
  }
  
  /**
   * Load screening data - fetch real universe scan results
   */
  async loadData() {
    if (this.isLoading) return;
    
    try {
      this.isLoading = true;
      this.showLoading('Scanning universe for new opportunities...');
      
      // REPLACE hardcoded data with real API call
      const response = await fetch('/api/alphastack/scan?limit=5');
      const result = await response.json();
      
      if (result.success) {
        this.data = result.candidates.map(candidate => ({
          symbol: candidate.symbol,
          score: candidate.score,
          bucket: this.getBucket(candidate.score),
          price: candidate.price,
          rsi: candidate.rsi,  // Show real RSI or undefined
          rel_vol_30m: candidate.rel_vol_30m || candidate.rel_vol,  // Real volume data
          short_interest: candidate.short_interest,  // Real short interest or null
          borrow_fee: candidate.borrow_fee,  // Real borrow fee or null
          reddit_mentions: candidate.reddit_mentions,  // Real Reddit data or undefined
          sentiment_score: candidate.sentiment_score,  // Real sentiment or undefined
          thesis: candidate.thesis,
          target_price: candidate.target_price,
          upside_pct: candidate.upside_pct,
          risk_note: candidate.risk_note
        }));
        
        console.log(`✅ AlphaStack: Loaded ${this.data.length} NEW opportunities`);
      } else {
        throw new Error(result.error);
      }
      
      // Rest of method stays exactly the same
      this.lastUpdate = new Date();
      this.renderResults();
      this.updateStats({ count: this.data.length });
      
    } catch (error) {
      console.error('❌ AlphaStack load error:', error);
      this.showError(`Error loading universe data: ${error.message}`);
    } finally {
      this.isLoading = false;
      this.resetButtonStates();
    }
  }
  
  /**
   * Trigger a new screening scan
   */
  async runScan() {
    if (this.isLoading) return;
    
    try {
      this.isLoading = true;
      this.showScanning();
      
      // Trigger universe scan via API
      const response = await fetch('/api/screener/universe-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          force_refresh: true,
          exclude_portfolio: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`Scan API Error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.error || 'Scan failed');
      }
      
      // Refresh data with new scan results
      await this.loadData();
      
      console.log(`✅ AlphaStack scan completed: ${result.candidates_found || 0} candidates found`);
      this.showSuccess(`Scan completed! Found ${result.candidates_found || 0} new opportunities`);
      
    } catch (error) {
      console.error('❌ AlphaStack scan error:', error);
      this.showError(`Scan failed: ${error.message}`);
    } finally {
      this.isLoading = false;
      this.resetButtonStates();
    }
  }
  
  /**
   * Render the screening results
   */
  renderResults() {
    const resultsContainer = document.getElementById('alphastack-results');
    
    if (this.data.length === 0) {
      resultsContainer.innerHTML = this.createEmptyState();
      return;
    }
    
    const cardsHTML = this.data.map(candidate => this.createCandidateCard(candidate)).join('');
    
    resultsContainer.innerHTML = `
      <div class="screener-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${cardsHTML}
      </div>
    `;
  }
  
  /**
   * Create a candidate card with comprehensive metrics
   */
  createCandidateCard(candidate) {
    const scoreColor = this.getScoreColor(candidate.score);
    const bucketColor = this.getBucketColor(candidate.bucket);
    
    return `
      <div class="candidate-card bg-white bg-opacity-10 rounded-lg p-4 border-l-4 ${bucketColor.border} hover:transform hover:scale-105 transition-all">
        <!-- Header -->
        <div class="flex justify-between items-start mb-3">
          <div>
            <h3 class="font-bold text-lg text-white">${candidate.symbol}</h3>
            <div class="text-sm text-blue-200">$${candidate.price.toFixed(2)}</div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold ${scoreColor}">${candidate.score}</div>
            <div class="text-xs ${bucketColor.text} font-medium">${candidate.bucket.toUpperCase()}</div>
          </div>
        </div>
        
        <!-- Metrics Grid -->
        <div class="metrics-grid grid grid-cols-2 gap-2 text-xs mb-3">
          <div class="metric">
            <span class="text-gray-400">RSI:</span>
            <span class="font-semibold">${candidate.rsi || 'N/A'}</span>
          </div>
          <div class="metric">
            <span class="text-gray-400">Rel Vol:</span>
            <span class="font-semibold">${candidate.rel_vol_30m ? candidate.rel_vol_30m + 'x' : 'N/A'}</span>
          </div>
          <div class="metric">
            <span class="text-gray-400">Short %:</span>
            <span class="font-semibold">${candidate.short_interest ? candidate.short_interest + '%' : 'N/A'}</span>
          </div>
          <div class="metric">
            <span class="text-gray-400">Borrow Fee:</span>
            <span class="font-semibold">${candidate.borrow_fee ? candidate.borrow_fee + '%' : 'N/A'}</span>
          </div>
          <div class="metric">
            <span class="text-gray-400">Reddit:</span>
            <span class="font-semibold">${candidate.reddit_mentions || 'N/A'}</span>
          </div>
          <div class="metric">
            <span class="text-gray-400">Sentiment:</span>
            <span class="font-semibold">${candidate.sentiment_score || 'N/A'}</span>
          </div>
        </div>
        
        <!-- Investment Thesis -->
        ${candidate.thesis ? `
        <div class="thesis-section mb-3 p-3 bg-blue-900 bg-opacity-30 rounded-lg border border-blue-700">
          <div class="flex items-start space-x-2">
            <span class="text-blue-300 text-sm mt-0.5">📋</span>
            <div class="flex-1">
              <div class="text-xs font-medium text-blue-200 mb-1">Investment Thesis</div>
              <div class="text-xs text-blue-100 leading-relaxed">${candidate.thesis}</div>
              ${candidate.target_price ? `
              <div class="text-xs text-green-300 mt-1 font-medium">
                🎯 Target: $${candidate.target_price} (+${candidate.upside_pct}%)
              </div>` : ''}
            </div>
          </div>
        </div>` : ''}
        
        <!-- Action Button -->
        <button onclick="window.executeBuy100('${candidate.symbol}', ${candidate.price})" 
                class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-all transform hover:scale-105 shadow-lg">
          💰 BUY $100 ${candidate.symbol}
        </button>
        
        <!-- Score Bar -->
        <div class="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all" 
               style="width: ${Math.min(candidate.score, 100)}%"></div>
        </div>
      </div>
    `;
  }
  
  /**
   * Create empty state when no candidates found
   */
  createEmptyState() {
    return `
      <div class="empty-state text-center py-12">
        <div class="text-6xl mb-4">🔍</div>
        <h3 class="text-xl font-bold mb-2">No Screening Results</h3>
        <p class="text-blue-200 mb-4">Click "Run Scan" to find new opportunities</p>
        <div class="text-xs text-blue-300">
          AlphaStack analyzes stocks across multiple factors including sentiment, technicals, and short interest
        </div>
      </div>
    `;
  }
  
  /**
   * Update statistics display
   */
  updateStats(result) {
    const statsContainer = document.getElementById('alphastack-stats');
    const metadata = result.metadata || {};
    
    statsContainer.innerHTML = `
      <div class="flex justify-center space-x-6">
        <div>${result.count} candidates found</div>
        ${metadata.avg_score ? `<div>Avg Score: ${metadata.avg_score.toFixed(0)}</div>` : ''}
        ${this.lastUpdate ? `<div>Updated: ${this.lastUpdate.toLocaleTimeString()}</div>` : ''}
      </div>
    `;
  }
  
  /**
   * Show loading state
   */
  showLoading(message = 'Loading...') {
    const resultsContainer = document.getElementById('alphastack-results');
    resultsContainer.innerHTML = `
      <div class="loading-state text-center py-8">
        <div class="animate-spin inline-block w-8 h-8 border-4 border-current border-t-transparent text-blue-400 rounded-full mb-4"></div>
        <div class="text-lg font-bold mb-2">${message}</div>
        <div class="text-blue-200 text-sm">Please wait...</div>
      </div>
    `;
  }
  
  /**
   * Show scanning state
   */
  showScanning() {
    this.showLoading('Running AlphaStack Scan...');
    
    const scanBtn = document.getElementById('alphastack-scan');
    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.innerHTML = '<span>⏳</span><span class="ml-1 text-sm">Scanning...</span>';
    }
  }
  
  /**
   * Show success message
   */
  showSuccess(message) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, 'success');
    } else {
      console.log('✅', message);
    }
  }
  
  /**
   * Show error message
   */
  showError(message) {
    const resultsContainer = document.getElementById('alphastack-results');
    resultsContainer.innerHTML = `
      <div class="error-state text-center py-8">
        <div class="text-4xl mb-3">❌</div>
        <div class="text-lg font-bold mb-2 text-red-400">Error</div>
        <div class="text-blue-200 text-sm">${message}</div>
        <button onclick="window.alphaStackScreener.loadData()" class="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">
          Try Again
        </button>
      </div>
    `;
  }
  
  /**
   * Reset button states after operations
   */
  resetButtonStates() {
    const refreshBtn = document.getElementById('alphastack-refresh');
    const scanBtn = document.getElementById('alphastack-scan');
    
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span>🔄</span><span class="ml-1 text-sm">Refresh Data</span>';
    }
    
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<span>🚀</span><span class="ml-1 text-sm">Run Scan</span>';
    }
  }
  
  /**
   * Get color classes for score display
   */
  getScoreColor(score) {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  }
  
  /**
   * Get color classes for bucket display
   */
  getBucket(score) {
    if (score >= 75) return 'trade-ready';
    if (score >= 60) return 'watch';
    return 'monitor';
  }
  
  getBucketColor(bucket) {
    switch (bucket) {
      case 'trade-ready':
        return { border: 'border-green-400', text: 'text-green-300' };
      case 'watch':
        return { border: 'border-yellow-400', text: 'text-yellow-300' };
      case 'monitor':
        return { border: 'border-blue-400', text: 'text-blue-300' };
      default:
        return { border: 'border-gray-400', text: 'text-gray-300' };
    }
  }
  
  /**
   * Calculate average score from current data
   */
  calculateAverageScore() {
    if (!this.data || this.data.length === 0) return 0;
    const sum = this.data.reduce((acc, item) => acc + (item.score || 0), 0);
    return Math.round(sum / this.data.length);
  }
}

// Global initialization function
window.initializeAlphaStackScreener = function(containerId) {
  window.alphaStackScreener = new AlphaStackScreener(containerId);
  window.alphaStackScreener.init();
  return window.alphaStackScreener;
};

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📊 AlphaStack Screener ready for initialization');
  });
} else {
  console.log('📊 AlphaStack Screener ready for initialization');
}
