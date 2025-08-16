// AlphaStack Screener Tile
class ScreenerTile {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.isRunning = false;
    this.lastUpdate = null;
    this.refreshInterval = null;
    
    if (!this.container) {
      console.error('Screener container not found:', containerId);
      return;
    }
    
    this.render();
    this.loadData();
    this.startAutoRefresh();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="screener-tile">
        <h2>🎯 AlphaStack Screener</h2>
        <div class="screener-controls">
          <button class="screener-btn" onclick="screener.runScan('premarket')" ${this.isRunning ? 'disabled' : ''}>
            📊 Pre-Market
          </button>
          <button class="screener-btn" onclick="screener.runScan('midday')" ${this.isRunning ? 'disabled' : ''}>
            🚀 Mid-Day
          </button>
          <button class="screener-btn" onclick="screener.runScan('powerhour')" ${this.isRunning ? 'disabled' : ''}>
            ⚡ Power Hour
          </button>
          <button class="screener-btn" onclick="screener.loadData()">
            🔄 Refresh
          </button>
        </div>
        <div id="screener-content">
          <div class="screener-loading">Loading screener data...</div>
        </div>
      </div>
    `;
  }
  
  async loadData() {
    try {
      const response = await fetch('/api/screener/top');
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Unknown error');
      }
      
      this.renderResults(data.items || []);
      this.lastUpdate = new Date();
      
    } catch (error) {
      console.error('Error loading screener data:', error);
      this.renderError(error.message);
    }
  }
  
  renderResults(items) {
    const content = document.getElementById('screener-content');
    
    if (items.length === 0) {
      content.innerHTML = '<div class="screener-empty">No screening results found. Run a scan to populate data.</div>';
      return;
    }
    
    const grid = items.map(item => this.renderCard(item)).join('');
    content.innerHTML = `
      <div class="screener-grid">
        ${grid}
      </div>
      <div style="text-align: center; margin-top: 16px; opacity: 0.7; font-size: 12px;">
        Last updated: ${this.lastUpdate ? this.lastUpdate.toLocaleTimeString() : 'Never'} | 
        ${items.length} candidates found
      </div>
    `;
  }
  
  renderCard(item) {
    const price = item.price ? `$${parseFloat(item.price).toFixed(2)}` : 'N/A';
    const score = item.score || 0;
    const bucket = item.bucket || 'unknown';
    const bucketClass = `bucket-${bucket.replace(/\s+/g, '-').toLowerCase()}`;
    
    // Technical metrics
    const rsi = item.rsi ? parseFloat(item.rsi).toFixed(1) : 'N/A';
    const relVol = item.rel_vol_30m ? parseFloat(item.rel_vol_30m).toFixed(1) + 'x' : 'N/A';
    const shortInt = item.short_interest ? (parseFloat(item.short_interest) * 100).toFixed(1) + '%' : 'N/A';
    const borrowFee = item.borrow_fee ? parseFloat(item.borrow_fee).toFixed(1) + '%' : 'N/A';
    
    // Sentiment metrics
    const reddit = item.reddit_mentions || 0;
    const stocktwits = item.stocktwits_msgs || 0;
    const youtube = item.youtube_trend || 0;
    
    return `
      <div class="screener-card ${bucketClass}">
        <div class="screener-symbol">
          <span>${item.symbol}</span>
          <span class="screener-score">${score}</span>
        </div>
        <div class="screener-price">${price}</div>
        
        <div class="screener-metrics">
          <div class="metric">
            <span class="metric-label">RSI:</span>
            <span class="metric-value">${rsi}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Rel Vol:</span>
            <span class="metric-value">${relVol}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Short %:</span>
            <span class="metric-value">${shortInt}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Borrow:</span>
            <span class="metric-value">${borrowFee}</span>
          </div>
        </div>
        
        <div class="screener-sentiment">
          <div class="sentiment-item">
            <span>Reddit</span>
            <span>${reddit}</span>
          </div>
          <div class="sentiment-item">
            <span>StockTwits</span>
            <span>${stocktwits}</span>
          </div>
          <div class="sentiment-item">
            <span>YouTube</span>
            <span>${youtube}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  renderError(message) {
    const content = document.getElementById('screener-content');
    content.innerHTML = `
      <div class="screener-error">
        ❌ Error loading data: ${message}
      </div>
    `;
  }
  
  async runScan(label) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.updateButtons();
    
    const content = document.getElementById('screener-content');
    content.innerHTML = `
      <div class="screener-loading">
        🔄 Running ${label} scan... This may take a few minutes.
      </div>
    `;
    
    try {
      // Call the backend to run the screener
      const response = await fetch('/api/screener/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });
      
      if (!response.ok) {
        throw new Error(`Scan failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Wait a moment then reload data
      setTimeout(() => {
        this.loadData();
      }, 2000);
      
    } catch (error) {
      console.error('Error running scan:', error);
      this.renderError(error.message);
    } finally {
      this.isRunning = false;
      this.updateButtons();
    }
  }
  
  updateButtons() {
    const buttons = this.container.querySelectorAll('.screener-btn');
    buttons.forEach(btn => {
      if (btn.onclick && btn.onclick.toString().includes('runScan')) {
        btn.disabled = this.isRunning;
      }
    });
  }
  
  startAutoRefresh() {
    // Refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      if (!this.isRunning) {
        this.loadData();
      }
    }, 5 * 60 * 1000);
  }
  
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('screener-tile')) {
    window.screener = new ScreenerTile('screener-tile');
  }
});