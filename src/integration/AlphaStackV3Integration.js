/**
 * AlphaStack V3 Integration Bridge
 * Allows the React component to work within the existing vanilla JS system
 */

// React and ReactDOM should be loaded via CDN or bundled
// This assumes React 18+ with createRoot

class AlphaStackV3Integration {
  constructor() {
    this.reactRoot = null;
    this.containerElement = null;
    this.isInitialized = false;
    
    // Bind methods
    this.init = this.init.bind(this);
    this.destroy = this.destroy.bind(this);
    this.handleCandidateSelect = this.handleCandidateSelect.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Initialize the React component within a container
   * @param {string} containerId - DOM element ID to mount React component
   * @param {Object} options - Configuration options
   */
  async init(containerId = 'alphastack-v3-container', options = {}) {
    try {
      // Check if React and ReactDOM are available
      if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
        throw new Error('React libraries not loaded. Please include React 18+ via CDN or bundle.');
      }

      // Get container element
      this.containerElement = document.getElementById(containerId);
      if (!this.containerElement) {
        throw new Error(`Container element #${containerId} not found`);
      }

      // Check feature flags
      const featureFlags = await this.loadFeatureFlags();
      if (!featureFlags.shouldUseV3()) {
        console.log('🔄 AlphaStack V3 disabled, skipping React integration');
        return false;
      }

      // Default options
      const config = {
        autoRefresh: true,
        refreshInterval: 30000,
        maxDisplayItems: 50,
        className: 'w-full h-full',
        ...options
      };

      // Create React root (React 18+ API)
      if (ReactDOM.createRoot) {
        this.reactRoot = ReactDOM.createRoot(this.containerElement);
      } else {
        // Fallback for React 17
        this.reactRoot = this.containerElement;
      }

      // Import the React component dynamically
      const { AlphaStackV3WithErrorBoundary } = await this.importAlphaStackComponent();

      // Create React element
      const reactElement = React.createElement(AlphaStackV3WithErrorBoundary, {
        className: config.className,
        autoRefresh: config.autoRefresh,
        refreshInterval: config.refreshInterval,
        onCandidateSelect: this.handleCandidateSelect,
        onError: this.handleError,
        onDataLoad: (data, stats) => {
          console.log(`📊 AlphaStack V3: Loaded ${data.length} candidates, avg score: ${stats.avgScore}`);
          
          // Emit custom event for other parts of the system
          this.emitDataLoadEvent(data, stats);
        }
      });

      // Render the component
      if (this.reactRoot.render) {
        this.reactRoot.render(reactElement);
      } else {
        ReactDOM.render(reactElement, this.reactRoot);
      }

      this.isInitialized = true;
      console.log('✅ AlphaStack V3 React component initialized successfully');

      // Add cleanup listener
      window.addEventListener('beforeunload', this.destroy);

      return true;

    } catch (error) {
      console.error('❌ AlphaStack V3 initialization failed:', error);
      
      // Show fallback content
      this.showFallbackContent(error.message);
      return false;
    }
  }

  /**
   * Dynamically import the React component
   * This allows for code splitting and lazy loading
   */
  async importAlphaStackComponent() {
    try {
      // In a real bundled environment, this would be:
      // return await import('../components/AlphaStackV3');
      
      // For now, assume the component is globally available
      if (window.AlphaStackV3Components) {
        return window.AlphaStackV3Components;
      }
      
      throw new Error('AlphaStack V3 components not found. Please ensure the component bundle is loaded.');
    } catch (error) {
      console.error('Failed to import AlphaStack V3 components:', error);
      throw error;
    }
  }

  /**
   * Load feature flags (async version for React integration)
   */
  async loadFeatureFlags() {
    try {
      // Try to load the feature flags module
      if (typeof require !== 'undefined') {
        return require('../config/feature-flags');
      } else {
        // Fallback for browser environment
        const response = await fetch('/api/config/feature-flags');
        return await response.json();
      }
    } catch (error) {
      console.warn('Failed to load feature flags, using defaults:', error);
      return {
        shouldUseV3: () => false, // Conservative fallback
        isEnabled: () => false,
        getConfig: () => ({ version: 'v2' })
      };
    }
  }

  /**
   * Handle candidate selection from React component
   * @param {Object} candidate - Selected candidate data
   */
  handleCandidateSelect(candidate) {
    console.log('📊 Candidate selected:', candidate.ticker);

    // Emit custom event for existing vanilla JS components
    const event = new CustomEvent('alphastack:candidateSelect', {
      detail: { candidate },
      bubbles: true
    });
    document.dispatchEvent(event);

    // Integration with existing portfolio system
    if (typeof window.portfolioManager !== 'undefined') {
      window.portfolioManager.addToWatchlist(candidate.ticker);
    }

    // Show candidate details modal (if exists)
    if (typeof window.showCandidateDetails === 'function') {
      window.showCandidateDetails(candidate);
    }
  }

  /**
   * Handle errors from React component
   * @param {Error} error - Error object
   */
  handleError(error) {
    console.error('❌ AlphaStack V3 component error:', error);

    // Emit error event
    const event = new CustomEvent('alphastack:error', {
      detail: { error },
      bubbles: true
    });
    document.dispatchEvent(event);

    // Integration with existing notification system
    if (typeof window.showNotification === 'function') {
      window.showNotification(`AlphaStack Error: ${error.message}`, 'error');
    }
  }

  /**
   * Emit data load event for system integration
   * @param {Array} data - Loaded candidate data
   * @param {Object} stats - Statistics object
   */
  emitDataLoadEvent(data, stats) {
    const event = new CustomEvent('alphastack:dataLoad', {
      detail: { data, stats },
      bubbles: true
    });
    document.dispatchEvent(event);

    // Update global state if exists
    if (window.tradingDashboard && window.tradingDashboard.updateAlphaStackData) {
      window.tradingDashboard.updateAlphaStackData(data, stats);
    }
  }

  /**
   * Show fallback content when React fails
   * @param {string} errorMessage - Error message to display
   */
  showFallbackContent(errorMessage) {
    if (!this.containerElement) return;

    this.containerElement.innerHTML = `
      <div class="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-6 text-center">
        <div class="text-4xl mb-3">⚠️</div>
        <h3 class="text-lg font-bold text-yellow-400 mb-2">React Component Failed</h3>
        <p class="text-yellow-300 text-sm mb-4">${errorMessage}</p>
        <button onclick="window.alphaStackIntegration.retryInit()" 
                class="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm">
          Retry React Component
        </button>
        <div class="mt-4">
          <a href="/screener.html" class="text-blue-400 hover:text-blue-300 text-sm underline">
            Use Legacy AlphaStack Interface
          </a>
        </div>
      </div>
    `;
  }

  /**
   * Retry initialization
   */
  async retryInit() {
    if (this.containerElement) {
      this.containerElement.innerHTML = '<div class="text-center py-8">Retrying...</div>';
    }
    
    // Wait a moment then retry
    setTimeout(() => {
      this.init();
    }, 1000);
  }

  /**
   * Clean up React component
   */
  destroy() {
    try {
      if (this.reactRoot && this.isInitialized) {
        if (this.reactRoot.unmount) {
          this.reactRoot.unmount();
        } else {
          ReactDOM.unmountComponentAtNode(this.containerElement);
        }
        
        this.reactRoot = null;
        this.isInitialized = false;
        
        console.log('🧹 AlphaStack V3 React component cleaned up');
      }

      // Remove event listener
      window.removeEventListener('beforeunload', this.destroy);

    } catch (error) {
      console.error('Error during AlphaStack V3 cleanup:', error);
    }
  }

  /**
   * Check if React component is active
   * @returns {boolean}
   */
  isActive() {
    return this.isInitialized && this.reactRoot !== null;
  }

  /**
   * Force refresh of React component data
   */
  refresh() {
    if (this.isActive()) {
      // Emit custom event that the React component can listen for
      const event = new CustomEvent('alphastack:forceRefresh', {
        bubbles: true
      });
      document.dispatchEvent(event);
    }
  }
}

// Initialize global integration instance
window.alphaStackIntegration = new AlphaStackV3Integration();

// Auto-initialize when DOM is ready (if container exists)
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('alphastack-v3-container');
  if (container) {
    console.log('🚀 Auto-initializing AlphaStack V3 React component');
    window.alphaStackIntegration.init();
  }
});

// Expose for manual initialization
window.initAlphaStackV3 = (containerId, options) => {
  return window.alphaStackIntegration.init(containerId, options);
};

// Integration with existing refresh systems
if (typeof window.refreshAllComponents === 'function') {
  const originalRefresh = window.refreshAllComponents;
  window.refreshAllComponents = function() {
    originalRefresh.call(this);
    if (window.alphaStackIntegration.isActive()) {
      window.alphaStackIntegration.refresh();
    }
  };
}

export default AlphaStackV3Integration;