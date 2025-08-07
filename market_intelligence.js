/**
 * Market Intelligence Discovery System
 * Parallel intelligence layer for automated market discovery
 * Monitors Reddit, YouTube, FDA, SEC for emerging catalysts
 */

const https = require('https');
const { EventEmitter } = require('events');
const DiscoveryStorage = require('./utils/discovery_storage');
const RedditMonitor = require('./agents/reddit_monitor');

class MarketIntelligence extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      redditClientId: process.env.REDDIT_CLIENT_ID || config.redditClientId,
      redditClientSecret: process.env.REDDIT_CLIENT_SECRET || config.redditClientSecret,
      youtubeApiKey: process.env.YOUTUBE_API_KEY || config.youtubeApiKey,
      fdaApiKey: process.env.FDA_API_KEY || config.fdaApiKey,
      edgarApiKey: process.env.EDGAR_API_KEY || config.edgarApiKey,
      ...config
    };
    
    this.discoveries = [];
    this.signalHistory = new Map();
    this.confluenceThreshold = 3; // Number of signals needed for high confidence
    this.isMonitoring = false;
    this.storage = new DiscoveryStorage('./data/market_intelligence');
    
    // Initialize monitoring agents
    this.redditMonitor = new RedditMonitor({
      clientId: this.config.redditClientId,
      clientSecret: this.config.redditClientSecret
    });
  }

  /**
   * Start monitoring all data sources
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Market intelligence already monitoring');
      return;
    }
    
    this.isMonitoring = true;
    console.log('🚀 Starting market intelligence monitoring...');
    
    // Start parallel monitoring of all sources
    this.monitorReddit();
    this.monitorYouTube();
    this.monitorFDA();
    this.monitorSEC();
    
    // Check for signal confluences every 5 minutes
    this.confluenceInterval = setInterval(() => {
      this.checkSignalConfluences();
    }, 5 * 60 * 1000);
    
    return { status: 'monitoring_started', sources: ['reddit', 'youtube', 'fda', 'sec'] };
  }

  /**
   * Monitor Reddit for unusual mention volume and sentiment
   */
  async monitorReddit() {
    if (!this.config.redditClientId || !this.config.redditClientSecret) {
      console.log('⚠️ Reddit API credentials not configured, using mock data');
      // Use mock implementation if no credentials
      return this.monitorRedditMock();
    }
    
    // Use real Reddit monitor
    this.redditInterval = await this.redditMonitor.startMonitoring(
      (discoveries) => {
        discoveries.forEach(signal => this.addDiscoverySignal(signal));
      },
      15 * 60 * 1000 // Check every 15 minutes
    );
  }
  
  /**
   * Mock Reddit monitoring for testing without API credentials
   */
  async monitorRedditMock() {
    const checkReddit = async () => {
      if (!this.isMonitoring) return;
      
      // Generate mock discoveries for testing
      const mockSymbols = ['NVDA', 'TSLA', 'GME', 'AMC', 'AAPL'];
      const randomSymbol = mockSymbols[Math.floor(Math.random() * mockSymbols.length)];
      
      if (Math.random() > 0.7) { // 30% chance of discovery
        const signal = {
          symbol: randomSymbol,
          source: 'reddit',
          type: 'unusual_volume',
          confidence: 0.5 + Math.random() * 0.5,
          timestamp: new Date().toISOString(),
          data: {
            mentionCount: Math.floor(Math.random() * 50) + 10,
            sentiment: Math.random(),
            sentimentLabel: Math.random() > 0.5 ? 'bullish' : 'bearish',
            topPosts: [
              {
                title: `${randomSymbol} to the moon! 🚀`,
                score: Math.floor(Math.random() * 1000),
                num_comments: Math.floor(Math.random() * 100)
              }
            ]
          }
        };
        
        this.addDiscoverySignal(signal);
      }
      
      // Check again in 15 minutes
      setTimeout(checkReddit, 15 * 60 * 1000);
    };
    
    checkReddit();
  }

  /**
   * Monitor YouTube for finance channel mentions
   */
  async monitorYouTube() {
    const channels = [
      'UCY2ifv8iH1Dsgjbf-iJUySw', // Meet Kevin
      'UCnMn36GT_H0X-w5_ckLtlgQ', // Financial Education
      'UCESLZhusAkFfsNsApnjF_Cg', // Andrei Jikh
    ];
    
    const checkYouTube = async () => {
      if (!this.isMonitoring) return;
      
      try {
        for (const channelId of channels) {
          const videos = await this.fetchYouTubeVideos(channelId);
          
          for (const video of videos) {
            const stockMentions = this.extractStockMentions(video.title + ' ' + video.description);
            
            for (const symbol of stockMentions) {
              const signal = {
                symbol,
                source: 'youtube',
                type: 'influencer_mention',
                confidence: this.calculateYouTubeConfidence(video),
                timestamp: new Date().toISOString(),
                data: {
                  channelId,
                  videoTitle: video.title,
                  viewCount: video.viewCount,
                  likeRatio: video.likeCount / (video.likeCount + video.dislikeCount),
                  publishedAt: video.publishedAt
                }
              };
              
              this.addDiscoverySignal(signal);
            }
          }
        }
      } catch (error) {
        console.error('❌ YouTube monitoring error:', error.message);
      }
      
      // Check again in 30 minutes
      setTimeout(checkYouTube, 30 * 60 * 1000);
    };
    
    checkYouTube();
  }

  /**
   * Monitor FDA for drug approvals and clinical trial results
   */
  async monitorFDA() {
    const checkFDA = async () => {
      if (!this.isMonitoring) return;
      
      try {
        const events = await this.fetchFDAEvents();
        
        for (const event of events) {
          if (event.companySymbol) {
            const signal = {
              symbol: event.companySymbol,
              source: 'fda',
              type: event.eventType,
              confidence: this.calculateFDAConfidence(event),
              timestamp: new Date().toISOString(),
              catalystDate: event.targetDate,
              data: {
                drugName: event.drugName,
                indication: event.indication,
                phase: event.phase,
                pdufaDate: event.pdufaDate
              }
            };
            
            this.addDiscoverySignal(signal);
          }
        }
      } catch (error) {
        console.error('❌ FDA monitoring error:', error.message);
      }
      
      // Check daily for FDA updates
      setTimeout(checkFDA, 24 * 60 * 60 * 1000);
    };
    
    checkFDA();
  }

  /**
   * Monitor SEC for significant filings
   */
  async monitorSEC() {
    const checkSEC = async () => {
      if (!this.isMonitoring) return;
      
      try {
        const filings = await this.fetchSECFilings();
        
        for (const filing of filings) {
          if (this.isSignificantFiling(filing)) {
            const signal = {
              symbol: filing.ticker,
              source: 'sec',
              type: filing.formType,
              confidence: this.calculateSECConfidence(filing),
              timestamp: new Date().toISOString(),
              data: {
                formType: filing.formType,
                filedAt: filing.filedAt,
                issuerName: filing.issuerName,
                description: filing.description,
                insiderTransaction: filing.insiderTransaction
              }
            };
            
            this.addDiscoverySignal(signal);
          }
        }
      } catch (error) {
        console.error('❌ SEC monitoring error:', error.message);
      }
      
      // Check every hour for new filings
      setTimeout(checkSEC, 60 * 60 * 1000);
    };
    
    checkSEC();
  }

  /**
   * Add discovery signal and check for confluences
   */
  async addDiscoverySignal(signal) {
    // Store signal in persistent storage
    try {
      await this.storage.saveSignal(signal);
    } catch (error) {
      console.error('Failed to persist signal:', error);
    }
    
    // Store signal in memory
    if (!this.signalHistory.has(signal.symbol)) {
      this.signalHistory.set(signal.symbol, []);
    }
    
    const signals = this.signalHistory.get(signal.symbol);
    signals.push(signal);
    
    // Keep only last 24 hours of signals
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSignals = signals.filter(s => new Date(s.timestamp) > cutoff);
    this.signalHistory.set(signal.symbol, recentSignals);
    
    // Emit discovery event
    this.emit('discovery', signal);
    
    // Check if this creates a confluence
    if (recentSignals.length >= this.confluenceThreshold) {
      const confluence = {
        symbol: signal.symbol,
        signals: recentSignals,
        confluenceScore: this.calculateConfluenceScore(recentSignals),
        timestamp: new Date().toISOString()
      };
      
      // Save confluence
      try {
        await this.storage.saveConfluence(confluence);
      } catch (error) {
        console.error('Failed to persist confluence:', error);
      }
      
      this.emit('confluence', confluence);
    }
  }

  /**
   * Check all symbols for signal confluences
   */
  checkSignalConfluences() {
    const confluences = [];
    
    for (const [symbol, signals] of this.signalHistory.entries()) {
      const uniqueSources = new Set(signals.map(s => s.source));
      
      if (uniqueSources.size >= this.confluenceThreshold) {
        const confluence = {
          symbol,
          sources: Array.from(uniqueSources),
          signalCount: signals.length,
          averageConfidence: signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length,
          signals: signals.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
        };
        
        confluences.push(confluence);
      }
    }
    
    if (confluences.length > 0) {
      this.emit('confluence_report', confluences);
    }
    
    return confluences;
  }

  /**
   * Calculate confidence scores for different sources
   */
  calculateRedditConfidence(data) {
    let confidence = 0;
    
    // Base confidence from mention count
    confidence += Math.min(data.count / 100, 0.3);
    
    // Sentiment factor
    if (data.sentiment > 0.7) confidence += 0.2;
    else if (data.sentiment > 0.5) confidence += 0.1;
    
    // Engagement factor
    const avgEngagement = data.topPosts.reduce((sum, p) => sum + p.score, 0) / data.topPosts.length;
    confidence += Math.min(avgEngagement / 10000, 0.2);
    
    // Account age and karma factor
    const avgKarma = data.topPosts.reduce((sum, p) => sum + p.authorKarma, 0) / data.topPosts.length;
    confidence += Math.min(avgKarma / 100000, 0.3);
    
    return Math.min(confidence, 1.0);
  }

  calculateYouTubeConfidence(video) {
    let confidence = 0;
    
    // View count factor
    confidence += Math.min(video.viewCount / 1000000, 0.3);
    
    // Like ratio factor
    const likeRatio = video.likeCount / (video.likeCount + video.dislikeCount);
    confidence += likeRatio * 0.3;
    
    // Recency factor
    const hoursSincePublish = (Date.now() - new Date(video.publishedAt)) / (1000 * 60 * 60);
    if (hoursSincePublish < 24) confidence += 0.3;
    else if (hoursSincePublish < 72) confidence += 0.2;
    else if (hoursSincePublish < 168) confidence += 0.1;
    
    // Channel authority (would need to track this)
    confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  calculateFDAConfidence(event) {
    let confidence = 0;
    
    // Event type importance
    if (event.eventType === 'approval') confidence += 0.5;
    else if (event.eventType === 'phase3_results') confidence += 0.4;
    else if (event.eventType === 'phase2_results') confidence += 0.2;
    
    // Timeline factor
    const daysUntilEvent = (new Date(event.targetDate) - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilEvent < 7) confidence += 0.3;
    else if (daysUntilEvent < 30) confidence += 0.2;
    else if (daysUntilEvent < 90) confidence += 0.1;
    
    // Market size factor (would need to estimate)
    confidence += 0.2;
    
    return Math.min(confidence, 1.0);
  }

  calculateSECConfidence(filing) {
    let confidence = 0;
    
    // Filing type importance
    if (filing.formType === '8-K') confidence += 0.3;
    else if (filing.formType === '4') confidence += 0.4;
    else if (filing.formType === 'SC 13G') confidence += 0.5;
    
    // Insider transaction size
    if (filing.insiderTransaction) {
      const transactionValue = filing.insiderTransaction.value;
      confidence += Math.min(transactionValue / 10000000, 0.3);
    }
    
    // Recency
    const hoursSinceFiling = (Date.now() - new Date(filing.filedAt)) / (1000 * 60 * 60);
    if (hoursSinceFiling < 4) confidence += 0.2;
    else if (hoursSinceFiling < 24) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  calculateConfluenceScore(signals) {
    const uniqueSources = new Set(signals.map(s => s.source));
    const sourceMultiplier = uniqueSources.size / 4; // Max 4 sources
    const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    
    return sourceMultiplier * avgConfidence;
  }

  /**
   * Extract stock ticker symbols from text
   */
  extractStockMentions(text) {
    const tickerPattern = /\b[A-Z]{1,5}\b/g;
    const mentions = text.match(tickerPattern) || [];
    
    // Filter common words that match pattern but aren't tickers
    const commonWords = ['THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'WILL', 'CAN'];
    
    return mentions.filter(m => !commonWords.includes(m));
  }

  /**
   * Determine if SEC filing is significant
   */
  isSignificantFiling(filing) {
    const significantForms = ['8-K', '4', 'SC 13G', 'SC 13D', 'DEF 14A'];
    
    if (!significantForms.includes(filing.formType)) {
      return false;
    }
    
    // Check for significant insider transactions
    if (filing.formType === '4' && filing.insiderTransaction) {
      return filing.insiderTransaction.value > 1000000;
    }
    
    // Check for significant institutional positions
    if (filing.formType.startsWith('SC 13')) {
      return filing.percentageOwned > 5;
    }
    
    return true;
  }

  /**
   * Placeholder API methods - implement with actual API calls
   */
  async fetchRedditMentions(subreddit) {
    // Placeholder - implement Reddit API integration
    return {};
  }

  async fetchYouTubeVideos(channelId) {
    // Placeholder - implement YouTube API integration
    return [];
  }

  async fetchFDAEvents() {
    // Placeholder - implement FDA API integration
    return [];
  }

  async fetchSECFilings() {
    // Placeholder - implement SEC EDGAR API integration
    return [];
  }

  /**
   * Get current discoveries
   */
  getDiscoveries() {
    const allSignals = [];
    
    for (const signals of this.signalHistory.values()) {
      allSignals.push(...signals);
    }
    
    return allSignals.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    
    if (this.confluenceInterval) {
      clearInterval(this.confluenceInterval);
    }
    
    console.log('🛑 Market intelligence monitoring stopped');
  }
}

module.exports = MarketIntelligence;