#!/usr/bin/env node
/**
 * MCP Server for Market Intelligence
 * Provides tools and resources for market discovery
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const MarketIntelligence = require('../market_intelligence');
const DiscoveryStorage = require('../utils/discovery_storage');

class MarketIntelligenceServer {
  constructor() {
    this.server = new Server(
      {
        name: 'market-intelligence-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );
    
    this.marketIntel = new MarketIntelligence();
    this.storage = new DiscoveryStorage('./data/market_intelligence');
    
    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [
        {
          name: 'scan_market',
          description: 'Scan all data sources for market intelligence',
          inputSchema: {
            type: 'object',
            properties: {
              sources: {
                type: 'array',
                items: { type: 'string' },
                description: 'Data sources to scan (reddit, youtube, fda, sec)'
              }
            }
          }
        },
        {
          name: 'get_discoveries',
          description: 'Get recent market discoveries',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of discoveries to return'
              },
              minConfidence: {
                type: 'number',
                description: 'Minimum confidence threshold (0-1)'
              }
            }
          }
        },
        {
          name: 'get_confluences',
          description: 'Get signal confluences where multiple sources align',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'analyze_symbol',
          description: 'Analyze all signals for a specific symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol to analyze'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_statistics',
          description: 'Get market intelligence statistics',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'scan_market':
          return await this.scanMarket(args.sources);
          
        case 'get_discoveries':
          return await this.getDiscoveries(args.limit, args.minConfidence);
          
        case 'get_confluences':
          return await this.getConfluences();
          
        case 'analyze_symbol':
          return await this.analyzeSymbol(args.symbol);
          
        case 'get_statistics':
          return await this.getStatistics();
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // List available resources
    this.server.setRequestHandler('resources/list', async () => ({
      resources: [
        {
          uri: 'discovery://recent',
          name: 'Recent Discoveries',
          description: 'Last 24 hours of market discoveries',
          mimeType: 'application/json'
        },
        {
          uri: 'discovery://confluences',
          name: 'Signal Confluences',
          description: 'Symbols with multiple converging signals',
          mimeType: 'application/json'
        },
        {
          uri: 'discovery://statistics',
          name: 'Discovery Statistics',
          description: 'Market intelligence statistics and metrics',
          mimeType: 'application/json'
        }
      ]
    }));

    // Handle resource reads
    this.server.setRequestHandler('resources/read', async (request) => {
      const { uri } = request.params;
      
      switch (uri) {
        case 'discovery://recent':
          const recent = await this.storage.getRecentSignals();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(recent, null, 2)
            }]
          };
          
        case 'discovery://confluences':
          const confluences = await this.storage.getConfluences();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(confluences, null, 2)
            }]
          };
          
        case 'discovery://statistics':
          const stats = await this.storage.getStatistics();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(stats, null, 2)
            }]
          };
          
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });

    // List available prompts
    this.server.setRequestHandler('prompts/list', async () => ({
      prompts: [
        {
          name: 'analyze_opportunity',
          description: 'Analyze a discovered market opportunity',
          arguments: [
            {
              name: 'symbol',
              description: 'Stock symbol to analyze',
              required: true
            }
          ]
        },
        {
          name: 'daily_summary',
          description: 'Generate daily market intelligence summary',
          arguments: []
        }
      ]
    }));

    // Handle prompt requests
    this.server.setRequestHandler('prompts/get', async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'analyze_opportunity':
          return await this.generateOpportunityAnalysis(args.symbol);
          
        case 'daily_summary':
          return await this.generateDailySummary();
          
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });
  }

  async scanMarket(sources = ['reddit', 'youtube', 'fda', 'sec']) {
    const results = [];
    
    if (!this.marketIntel.isMonitoring) {
      await this.marketIntel.startMonitoring();
    }
    
    // Wait for initial scan results
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const discoveries = this.marketIntel.getDiscoveries();
    
    return {
      content: [
        {
          type: 'text',
          text: `Found ${discoveries.length} market discoveries from ${sources.join(', ')}`
        }
      ]
    };
  }

  async getDiscoveries(limit = 20, minConfidence = 0.5) {
    const discoveries = await this.storage.getSignals();
    
    const filtered = discoveries
      .filter(d => d.confidence >= minConfidence)
      .slice(0, limit);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filtered, null, 2)
        }
      ]
    };
  }

  async getConfluences() {
    const confluences = await this.storage.getConfluences();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(confluences, null, 2)
        }
      ]
    };
  }

  async analyzeSymbol(symbol) {
    const signals = await this.storage.getSignalsBySymbol(symbol);
    const history = await this.storage.getHistory();
    const symbolHistory = history[symbol];
    
    const analysis = {
      symbol,
      totalSignals: signals.length,
      recentSignals: signals.slice(0, 5),
      history: symbolHistory,
      recommendation: this.generateRecommendation(signals, symbolHistory)
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }
      ]
    };
  }

  async getStatistics() {
    const stats = await this.storage.getStatistics();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2)
        }
      ]
    };
  }

  generateRecommendation(signals, history) {
    if (!signals || signals.length === 0) {
      return 'No signals - insufficient data';
    }
    
    const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    const recentSignals = signals.filter(s => 
      new Date(s.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    
    if (recentSignals.length >= 3 && avgConfidence > 0.7) {
      return 'HIGH INTEREST - Multiple recent signals with high confidence';
    } else if (recentSignals.length >= 2 && avgConfidence > 0.6) {
      return 'MODERATE INTEREST - Some recent activity detected';
    } else if (avgConfidence > 0.8) {
      return 'WATCH - High confidence but limited signals';
    } else {
      return 'MONITOR - Limited signal activity';
    }
  }

  async generateOpportunityAnalysis(symbol) {
    const analysis = await this.analyzeSymbol(symbol);
    
    const prompt = `
Analyze this market intelligence discovery:

Symbol: ${symbol}
Total Signals: ${analysis.totalSignals}
Recent Activity: ${analysis.recentSignals.length} signals in last 24 hours
Recommendation: ${analysis.recommendation}

Recent Signals:
${JSON.stringify(analysis.recentSignals, null, 2)}

Provide a brief analysis covering:
1. Signal strength and convergence
2. Potential catalysts
3. Risk factors
4. Suggested action
    `.trim();
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ]
    };
  }

  async generateDailySummary() {
    const stats = await this.storage.getStatistics();
    const confluences = await this.storage.getConfluences();
    const topSymbols = stats.topSymbols || [];
    
    const prompt = `
Generate a daily market intelligence summary:

Statistics:
- Total Discoveries: ${stats.totalSignals}
- Recent (24h): ${stats.recentSignals}
- Confluences: ${stats.totalConfluences}
- Unique Symbols: ${stats.uniqueSymbols}

Top Symbols by Activity:
${topSymbols.map(s => `- ${s.symbol}: ${s.signalCount} signals`).join('\n')}

Signal Confluences:
${confluences.slice(0, 3).map(c => 
  `- ${c.symbol}: ${c.sources.join(', ')} (${(c.averageConfidence * 100).toFixed(0)}% confidence)`
).join('\n')}

Provide a concise summary highlighting:
1. Key opportunities discovered
2. Unusual market activity patterns
3. High-confidence confluences
4. Recommended focus areas for today
    `.trim();
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Market Intelligence MCP Server running...');
  }
}

// Run the server
if (require.main === module) {
  const server = new MarketIntelligenceServer();
  server.run().catch(console.error);
}

module.exports = MarketIntelligenceServer;