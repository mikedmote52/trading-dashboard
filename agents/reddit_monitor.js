/**
 * Reddit Sentiment Monitoring Agent
 * Monitors WSB and stock subreddits for unusual activity
 */

const https = require('https');

class RedditMonitor {
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.REDDIT_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.REDDIT_CLIENT_SECRET;
    this.userAgent = config.userAgent || 'TradingIntelligence/1.0';
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Target subreddits
    this.subreddits = [
      'wallstreetbets',
      'stocks', 
      'StockMarket',
      'SecurityAnalysis',
      'ValueInvesting',
      'options',
      'Daytrading'
    ];
    
    // Track mention history
    this.mentionHistory = new Map();
    this.baselineWindow = 7 * 24 * 60 * 60 * 1000; // 7 days for baseline
  }

  /**
   * Authenticate with Reddit API
   */
  async authenticate() {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }
    
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const options = {
        hostname: 'www.reddit.com',
        path: '/api/v1/access_token',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.access_token) {
              this.accessToken = response.access_token;
              this.tokenExpiry = Date.now() + (response.expires_in * 1000);
              resolve(this.accessToken);
            } else {
              reject(new Error('Failed to get Reddit access token'));
            }
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.write('grant_type=client_credentials');
      req.end();
    });
  }

  /**
   * Fetch posts from a subreddit
   */
  async fetchSubredditPosts(subreddit, sort = 'hot', limit = 100) {
    const token = await this.authenticate();
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'oauth.reddit.com',
        path: `/r/${subreddit}/${sort}.json?limit=${limit}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': this.userAgent
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.data && response.data.children) {
              resolve(response.data.children.map(child => child.data));
            } else {
              resolve([]);
            }
          } catch (error) {
            console.error(`Error parsing Reddit response for r/${subreddit}:`, error);
            resolve([]);
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`Error fetching r/${subreddit}:`, error);
        resolve([]);
      });
      
      req.end();
    });
  }

  /**
   * Extract stock ticker mentions from text
   */
  extractTickers(text) {
    // Common tickers to exclude (too generic)
    const excludeList = [
      'I', 'A', 'DD', 'ALL', 'OR', 'GO', 'NOW', 'RH', 'EV', 'ARE',
      'FOR', 'THE', 'AND', 'CEO', 'CFO', 'USA', 'NYC', 'GDP', 'FBI',
      'ATH', 'ITM', 'OTM', 'PDT', 'IV', 'ER', 'PE', 'EPS', 'IPO'
    ];
    
    // Match $TICKER format first (most reliable)
    const dollarTickers = (text.match(/\$[A-Z]{1,5}\b/g) || [])
      .map(t => t.substring(1));
    
    // Match standalone uppercase words (less reliable)
    const standaloneTickers = (text.match(/\b[A-Z]{2,5}\b/g) || [])
      .filter(t => !excludeList.includes(t));
    
    // Combine and deduplicate
    const allTickers = [...new Set([...dollarTickers, ...standaloneTickers])];
    
    return allTickers;
  }

  /**
   * Analyze sentiment from post data
   */
  analyzeSentiment(post) {
    const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
    
    // Bullish keywords
    const bullishKeywords = [
      'moon', 'rocket', 'squeeze', 'gamma', 'calls', 'bull', 'bullish',
      'buy', 'long', 'pump', 'tendies', 'yolo', 'diamond hands', 'hold',
      'breakout', 'momentum', 'printing', 'winner', 'gains'
    ];
    
    // Bearish keywords
    const bearishKeywords = [
      'puts', 'bear', 'bearish', 'sell', 'short', 'dump', 'crash',
      'drill', 'tank', 'red', 'loss', 'baghold', 'dead', 'avoid',
      'overvalued', 'bubble', 'correction'
    ];
    
    let bullishScore = 0;
    let bearishScore = 0;
    
    bullishKeywords.forEach(keyword => {
      if (text.includes(keyword)) bullishScore++;
    });
    
    bearishKeywords.forEach(keyword => {
      if (text.includes(keyword)) bearishScore++;
    });
    
    const totalScore = bullishScore + bearishScore;
    if (totalScore === 0) return 0.5; // Neutral
    
    return bullishScore / totalScore; // 0 = bearish, 1 = bullish
  }

  /**
   * Scan all subreddits for unusual activity
   */
  async scanSubreddits() {
    const tickerMentions = new Map();
    const tickerSentiment = new Map();
    const tickerPosts = new Map();
    
    console.log('🔍 Scanning Reddit for unusual stock mentions...');
    
    for (const subreddit of this.subreddits) {
      try {
        // Fetch hot posts
        const hotPosts = await this.fetchSubredditPosts(subreddit, 'hot', 50);
        
        // Fetch new posts for emerging trends
        const newPosts = await this.fetchSubredditPosts(subreddit, 'new', 50);
        
        const allPosts = [...hotPosts, ...newPosts];
        
        for (const post of allPosts) {
          const tickers = this.extractTickers(`${post.title} ${post.selftext || ''}`);
          const sentiment = this.analyzeSentiment(post);
          
          for (const ticker of tickers) {
            // Track mentions
            if (!tickerMentions.has(ticker)) {
              tickerMentions.set(ticker, 0);
              tickerSentiment.set(ticker, []);
              tickerPosts.set(ticker, []);
            }
            
            tickerMentions.set(ticker, tickerMentions.get(ticker) + 1);
            tickerSentiment.get(ticker).push(sentiment);
            
            // Store top posts for this ticker
            const posts = tickerPosts.get(ticker);
            if (posts.length < 5) {
              posts.push({
                subreddit,
                title: post.title,
                score: post.score,
                num_comments: post.num_comments,
                created_utc: post.created_utc,
                author: post.author,
                url: `https://reddit.com${post.permalink}`,
                sentiment
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning r/${subreddit}:`, error.message);
      }
    }
    
    return this.analyzeResults(tickerMentions, tickerSentiment, tickerPosts);
  }

  /**
   * Analyze scan results for unusual activity
   */
  analyzeResults(tickerMentions, tickerSentiment, tickerPosts) {
    const discoveries = [];
    
    for (const [ticker, count] of tickerMentions.entries()) {
      if (count < 5) continue; // Minimum threshold
      
      const sentiments = tickerSentiment.get(ticker);
      const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
      const posts = tickerPosts.get(ticker);
      
      // Calculate baseline comparison
      const baseline = this.getBaselineMentions(ticker);
      const mentionMultiple = baseline > 0 ? count / baseline : count;
      
      // Check for unusual activity
      if (mentionMultiple > 3 || count > 20) {
        discoveries.push({
          symbol: ticker,
          mentionCount: count,
          mentionMultiple,
          sentiment: avgSentiment,
          sentimentLabel: avgSentiment > 0.6 ? 'bullish' : avgSentiment < 0.4 ? 'bearish' : 'neutral',
          topPosts: posts.sort((a, b) => b.score - a.score).slice(0, 3),
          totalScore: posts.reduce((sum, p) => sum + p.score, 0),
          totalComments: posts.reduce((sum, p) => sum + p.num_comments, 0)
        });
      }
    }
    
    // Sort by mention multiple (unusual activity)
    return discoveries.sort((a, b) => b.mentionMultiple - a.mentionMultiple);
  }

  /**
   * Get baseline mention count for a ticker
   */
  getBaselineMentions(ticker) {
    // In production, this would query historical data
    // For now, return a default baseline
    const commonTickers = {
      'GME': 50, 'AMC': 40, 'TSLA': 60, 'AAPL': 30, 'SPY': 40,
      'NVDA': 35, 'AMD': 25, 'MSFT': 20, 'META': 15, 'GOOGL': 15
    };
    
    return commonTickers[ticker] || 5;
  }

  /**
   * Format discoveries for market intelligence
   */
  formatDiscoveries(discoveries) {
    return discoveries.map(discovery => ({
      symbol: discovery.symbol,
      source: 'reddit',
      type: 'unusual_volume',
      confidence: this.calculateConfidence(discovery),
      timestamp: new Date().toISOString(),
      data: {
        mentionCount: discovery.mentionCount,
        mentionMultiple: discovery.mentionMultiple,
        sentiment: discovery.sentiment,
        sentimentLabel: discovery.sentimentLabel,
        topPosts: discovery.topPosts,
        totalEngagement: discovery.totalScore + discovery.totalComments
      }
    }));
  }

  /**
   * Calculate confidence score for discovery
   */
  calculateConfidence(discovery) {
    let confidence = 0;
    
    // Mention volume factor (up to 0.3)
    confidence += Math.min(discovery.mentionCount / 100, 0.3);
    
    // Unusual activity factor (up to 0.3)
    confidence += Math.min(discovery.mentionMultiple / 10, 0.3);
    
    // Sentiment strength factor (up to 0.2)
    const sentimentStrength = Math.abs(discovery.sentiment - 0.5) * 2;
    confidence += sentimentStrength * 0.2;
    
    // Engagement factor (up to 0.2)
    const avgEngagement = (discovery.totalScore + discovery.totalComments) / discovery.topPosts.length;
    confidence += Math.min(avgEngagement / 5000, 0.2);
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Monitor Reddit continuously
   */
  async startMonitoring(callback, interval = 15 * 60 * 1000) {
    console.log('🚀 Starting Reddit monitoring...');
    
    const scan = async () => {
      try {
        const discoveries = await this.scanSubreddits();
        const formatted = this.formatDiscoveries(discoveries);
        
        if (formatted.length > 0) {
          console.log(`📊 Found ${formatted.length} unusual Reddit mentions`);
          callback(formatted);
        }
      } catch (error) {
        console.error('Reddit monitoring error:', error);
      }
    };
    
    // Initial scan
    await scan();
    
    // Set up recurring scans
    return setInterval(scan, interval);
  }
}

module.exports = RedditMonitor;