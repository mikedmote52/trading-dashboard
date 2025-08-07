/**
 * Discovery Signal Storage System
 * Simple file-based storage for market intelligence discoveries
 */

const fs = require('fs').promises;
const path = require('path');

class DiscoveryStorage {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.signalsFile = path.join(dataDir, 'discovery_signals.json');
    this.confluencesFile = path.join(dataDir, 'confluences.json');
    this.historyFile = path.join(dataDir, 'signal_history.json');
    this.initialized = false;
  }

  /**
   * Initialize storage directories and files
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Initialize files if they don't exist
      await this.initializeFile(this.signalsFile, []);
      await this.initializeFile(this.confluencesFile, []);
      await this.initializeFile(this.historyFile, {});
      
      this.initialized = true;
      console.log('✅ Discovery storage initialized');
    } catch (error) {
      console.error('❌ Failed to initialize discovery storage:', error);
      throw error;
    }
  }

  /**
   * Initialize a file with default data if it doesn't exist
   */
  async initializeFile(filePath, defaultData) {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
    }
  }

  /**
   * Save discovery signal
   */
  async saveSignal(signal) {
    await this.initialize();
    
    try {
      // Add unique ID and timestamp if not present
      const signalWithMeta = {
        id: signal.id || `${signal.symbol}-${signal.source}-${Date.now()}`,
        timestamp: signal.timestamp || new Date().toISOString(),
        ...signal
      };
      
      // Read existing signals
      const signals = await this.getSignals();
      
      // Add new signal (keep last 100 signals)
      signals.unshift(signalWithMeta);
      const trimmedSignals = signals.slice(0, 100);
      
      // Save to file
      await fs.writeFile(this.signalsFile, JSON.stringify(trimmedSignals, null, 2));
      
      // Update signal history
      await this.updateHistory(signalWithMeta);
      
      return signalWithMeta;
    } catch (error) {
      console.error('Failed to save signal:', error);
      throw error;
    }
  }

  /**
   * Save confluence
   */
  async saveConfluence(confluence) {
    await this.initialize();
    
    try {
      const confluenceWithMeta = {
        id: confluence.id || `confluence-${confluence.symbol}-${Date.now()}`,
        timestamp: confluence.timestamp || new Date().toISOString(),
        ...confluence
      };
      
      const confluences = await this.getConfluences();
      confluences.unshift(confluenceWithMeta);
      const trimmedConfluences = confluences.slice(0, 50);
      
      await fs.writeFile(this.confluencesFile, JSON.stringify(trimmedConfluences, null, 2));
      
      return confluenceWithMeta;
    } catch (error) {
      console.error('Failed to save confluence:', error);
      throw error;
    }
  }

  /**
   * Update signal history for a symbol
   */
  async updateHistory(signal) {
    try {
      const history = await this.getHistory();
      
      if (!history[signal.symbol]) {
        history[signal.symbol] = {
          symbol: signal.symbol,
          firstSeen: signal.timestamp,
          lastSeen: signal.timestamp,
          signalCount: 0,
          sources: [],
          avgConfidence: 0,
          signals: []
        };
      }
      
      const symbolHistory = history[signal.symbol];
      
      // Update metadata
      symbolHistory.lastSeen = signal.timestamp;
      symbolHistory.signalCount++;
      
      // Track unique sources
      if (!symbolHistory.sources.includes(signal.source)) {
        symbolHistory.sources.push(signal.source);
      }
      
      // Update average confidence
      symbolHistory.avgConfidence = 
        (symbolHistory.avgConfidence * (symbolHistory.signalCount - 1) + signal.confidence) / 
        symbolHistory.signalCount;
      
      // Keep last 10 signals for this symbol
      symbolHistory.signals.unshift({
        timestamp: signal.timestamp,
        source: signal.source,
        confidence: signal.confidence,
        type: signal.type
      });
      symbolHistory.signals = symbolHistory.signals.slice(0, 10);
      
      await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Failed to update history:', error);
    }
  }

  /**
   * Get all signals
   */
  async getSignals() {
    await this.initialize();
    
    try {
      const data = await fs.readFile(this.signalsFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read signals:', error);
      return [];
    }
  }

  /**
   * Get signals for a specific symbol
   */
  async getSignalsBySymbol(symbol) {
    const signals = await this.getSignals();
    return signals.filter(s => s.symbol === symbol);
  }

  /**
   * Get signals from a specific source
   */
  async getSignalsBySource(source) {
    const signals = await this.getSignals();
    return signals.filter(s => s.source === source);
  }

  /**
   * Get recent signals (last 24 hours)
   */
  async getRecentSignals() {
    const signals = await this.getSignals();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return signals.filter(s => new Date(s.timestamp) > cutoff);
  }

  /**
   * Get all confluences
   */
  async getConfluences() {
    await this.initialize();
    
    try {
      const data = await fs.readFile(this.confluencesFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read confluences:', error);
      return [];
    }
  }

  /**
   * Get signal history
   */
  async getHistory() {
    await this.initialize();
    
    try {
      const data = await fs.readFile(this.historyFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read history:', error);
      return {};
    }
  }

  /**
   * Get top symbols by signal count
   */
  async getTopSymbols(limit = 10) {
    const history = await this.getHistory();
    
    const symbols = Object.values(history)
      .sort((a, b) => b.signalCount - a.signalCount)
      .slice(0, limit);
    
    return symbols;
  }

  /**
   * Clean old data (older than 7 days)
   */
  async cleanOldData() {
    await this.initialize();
    
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // Clean signals
      const signals = await this.getSignals();
      const recentSignals = signals.filter(s => new Date(s.timestamp) > cutoff);
      await fs.writeFile(this.signalsFile, JSON.stringify(recentSignals, null, 2));
      
      // Clean confluences
      const confluences = await this.getConfluences();
      const recentConfluences = confluences.filter(c => new Date(c.timestamp) > cutoff);
      await fs.writeFile(this.confluencesFile, JSON.stringify(recentConfluences, null, 2));
      
      console.log(`🧹 Cleaned old data: removed ${signals.length - recentSignals.length} signals and ${confluences.length - recentConfluences.length} confluences`);
    } catch (error) {
      console.error('Failed to clean old data:', error);
    }
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    await this.initialize();
    
    const signals = await this.getSignals();
    const recentSignals = await this.getRecentSignals();
    const confluences = await this.getConfluences();
    const history = await this.getHistory();
    
    const sourceCount = {};
    signals.forEach(s => {
      sourceCount[s.source] = (sourceCount[s.source] || 0) + 1;
    });
    
    return {
      totalSignals: signals.length,
      recentSignals: recentSignals.length,
      totalConfluences: confluences.length,
      uniqueSymbols: Object.keys(history).length,
      signalsBySource: sourceCount,
      topSymbols: await this.getTopSymbols(5)
    };
  }
}

module.exports = DiscoveryStorage;