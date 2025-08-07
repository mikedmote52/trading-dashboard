# Trading Intelligence System - Architecture Documentation

## 🏗️ **System Architecture Overview**

This document provides comprehensive technical documentation for the Trading Intelligence Dashboard system deployed on Render.

## 📁 **Optimized File Structure**

```
trading-dashboard/
├── 📁 core/                          # Core system components
│   ├── server.js                     # Main Express.js server
│   ├── portfolio_intelligence.js     # Portfolio analysis engine
│   └── simple_data_backup.js         # Data persistence layer
├── 📁 algorithms/                    # Trading algorithms
│   └── VIGL_Discovery_Complete.py    # Proven pattern detection (324% winner)
├── 📁 integrations/                  # External system integrations  
│   ├── dashboard_integration_patch.py # Portfolio intelligence plugin
│   └── portfolio_intelligence_plugin.py # Python analysis module
├── 📁 automation/                    # Automated scanning and monitoring
│   ├── automated_scanner.js          # Scheduled scanning system
│   └── start-daily-trading.sh        # Startup automation
├── 📁 public/                        # Frontend static files
│   └── index.html                    # Dashboard interface
├── 📁 data/                          # Data storage and caching
│   ├── real_vigl_data.json           # VIGL discovery cache
│   └── historical_data/              # Auto-generated historical data
├── 📁 config/                        # Configuration and deployment
│   ├── package.json                  # Node.js dependencies
│   ├── render.yaml                   # Render deployment config
│   └── .env.example                  # Environment variables template
├── 📁 docs/                          # Documentation
│   ├── README.md                     # User guide and quick start
│   ├── SYSTEM_ARCHITECTURE.md        # This technical documentation
│   ├── DEVELOPMENT_PATTERNS.md       # Development guidelines
│   └── API_DOCUMENTATION.md          # API endpoint documentation
└── 📁 scripts/                       # Utility and maintenance scripts
    └── deployment_scripts/           # Deployment automation
```

## 🔧 **Technical Components**

### **Core Server Architecture**
- **Framework**: Express.js with CORS enabled
- **Port**: Configurable (default 3001 local, dynamic on Render)
- **API Integration**: Alpaca Markets (portfolio) + Polygon (market data)
- **Caching**: 30-minute intelligent caching for VIGL discoveries
- **Data Persistence**: JSON-based backups + SQLite for analytics

### **Portfolio Intelligence Engine**
```javascript
// Real-time portfolio analysis
class PortfolioIntelligence {
  - generatePortfolioAlerts()     // Risk assessment and opportunities
  - analyzePositionRisk()         // WOLF risk scoring
  - generateMarketTimingAlerts()  // Pre-market, power hour alerts
  - fetchAlpacaData()            // Real-time position data
}
```

### **VIGL Pattern Detection**
```python
# Proven 324% winner algorithm
VIGL_Discovery_Complete.py:
  - Smart universe filtering (6000+ → 20 high-potential stocks)
  - Pattern similarity scoring (>85% for high confidence)
  - Volume spike detection (>10x normal volume)
  - Momentum analysis (technical breakout patterns)
```

### **Data Flow Architecture**
```
Browser Request → Express Server → Portfolio Intelligence Engine
                ↓                           ↓
            VIGL Scanner ← ← ← ← ← Alpaca API Integration
                ↓                           ↓
        Pattern Analysis → → → Data Backup → Recent Alerts
                ↓                           ↓
          Dashboard Response ← ← ← ← ← JSON Response
```

## 🚀 **Deployment Configuration**

### **Render Deployment (Production)**
```yaml
# render.yaml
services:
- type: web
  name: trading-dashboard
  env: node
  buildCommand: npm install
  startCommand: npm start
  envVars:
  - key: NODE_ENV
    value: production
```

### **Environment Variables**
```bash
# Required for production
APCA_API_KEY_ID=your_alpaca_key
APCA_API_SECRET_KEY=your_alpaca_secret  
APCA_API_BASE_URL=https://paper-api.alpaca.markets
POLYGON_API_KEY=your_polygon_key
NODE_ENV=production
PORT=auto_assigned_by_render
```

### **Local Development**
```bash
# Start local development server
npm install
npm start
# Access at http://localhost:3001
```

## 🔄 **Automated Systems**

### **Scanning Schedule**
- **Trigger**: Dashboard API calls (`/api/dashboard`)
- **Frequency**: On-demand with 30-minute intelligent caching
- **Market Hours**: Active during 7 AM - 8 PM EST (weekdays)
- **Data Persistence**: Daily JSON backups of all key metrics

### **Data Collection Points**
- **Portfolio Snapshots**: Real-time position data, P&L, risk scores
- **VIGL Discoveries**: Pattern matches >60% confidence with volume spikes
- **Alert Generation**: Risk warnings, opportunities, market timing
- **Performance Tracking**: Win/loss rates, timing patterns, ROI analysis

## 📊 **API Endpoints**

### **Dashboard Data Endpoint**
```
GET /api/dashboard
Response: {
  portfolio: { positions: [...], totalValue: number, dailyPnL: number },
  discoveries: [ { symbol, confidence, volumeSpike, recommendation } ],
  alerts: [ { title, message, severity, timestamp } ],
  lastUpdated: timestamp,
  summary: { viglScore, avgWolfRisk, highRiskPositions }
}
```

### **Health Check**
```
GET /health
Response: { status: "healthy", timestamp: ISO_DATE }
```

## 🛡️ **Security & Risk Management**

### **API Security**
- Environment variable protection for API keys
- HTTPS enforcement on Render deployment  
- CORS configuration for dashboard access
- Request timeout protection (10 seconds)

### **Risk Management Features**
- **WOLF Risk Scoring**: Multi-factor risk assessment for each position
- **Position Limits**: Configurable position sizing recommendations
- **Stop Loss Integration**: Automated stop loss suggestions
- **Real-time Alerts**: High-priority risk warnings in Recent Alerts

## 📈 **Performance Monitoring**

### **System Metrics**
- **Response Time**: Target <2 seconds for dashboard loads
- **Cache Hit Rate**: >80% for repeated VIGL scans within 30 minutes
- **API Success Rate**: >95% uptime for Alpaca/Polygon integrations
- **Data Accuracy**: Real-time validation against source systems

### **Trading Intelligence Metrics**
- **VIGL Pattern Success Rate**: Target >70% for high-confidence patterns
- **Risk Prevention Rate**: Target >80% loss prevention via WOLF scoring
- **Alert Accuracy**: Target >75% actionable alert success rate
- **Portfolio Performance**: Track against benchmark indices

## 🔧 **Development Workflow**

### **Local Development Setup**
```bash
# Clone and setup
git clone [repository]
cd trading-dashboard
npm install

# Environment setup
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm start
```

### **Testing Framework**
- **API Testing**: Manual testing via dashboard interface
- **Integration Testing**: Real-time validation against Alpaca paper trading
- **Performance Testing**: VIGL discovery speed and accuracy validation

### **Deployment Process**
```bash
# Commit changes
git add .
git commit -m "Description of changes"

# Deploy to Render (auto-deploys on push to main)
git push origin main
```

## 🎯 **Context Engineering for AI Assistance**

### **System Intent**
This system connects proven trading algorithms (324% VIGL winner) with real-time portfolio management for enhanced decision-making through AI-powered insights.

### **Core Objectives**
1. **Pattern Recognition**: Identify high-probability trading opportunities
2. **Risk Management**: Prevent significant losses through predictive scoring  
3. **Portfolio Optimization**: Enhance returns through intelligent position management
4. **Learning Enhancement**: Collect data for continuous system improvement

### **AI Assistant Guidelines**
- **Preserve Core Algorithms**: Never modify the proven VIGL discovery logic
- **Enhance Intelligence**: Focus on improving recommendation accuracy and risk assessment
- **Maintain Performance**: Ensure sub-2-second response times for dashboard loads
- **Data Integrity**: Protect real trading data and maintain accurate historical records

## 🔄 **Continuous Improvement Framework**

### **Data-Driven Optimization**
- **Weekly Analysis**: Pattern success rates and timing optimization
- **Monthly Reviews**: System performance and recommendation accuracy
- **Quarterly Updates**: Algorithm refinements based on collected data

### **Feature Evolution Roadmap**
- **Phase 1**: Data collection and baseline establishment ✅ COMPLETE
- **Phase 2**: Pattern learning and optimization (Days 1-30) 🔄 ACTIVE  
- **Phase 3**: Predictive analytics and autonomous recommendations (Days 31-90)
- **Phase 4**: Advanced AI integration and portfolio optimization (Days 91+)

---

**Last Updated**: August 7, 2025  
**System Status**: 🟢 Production Ready - Learning Phase Active  
**Deployment**: https://trading-dashboard-dvou.onrender.com