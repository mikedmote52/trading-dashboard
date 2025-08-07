# Contributing Guidelines

## Development Principles

### ⚠️ CRITICAL: Preserve System Integrity
- **NEVER modify existing working functionality**
- **NEVER add mock or fake data**
- **ALWAYS test changes before committing**
- **PRESERVE the proven VIGL algorithm**

### Core System Protection
The following files contain critical business logic and should not be modified:
- `VIGL_Discovery_Complete.py` - Proven 324% winner algorithm
- `server.js` - Main API endpoints (enhance, don't break)
- `portfolio_intelligence.js` - Portfolio analysis engine
- `real_vigl_data.json` - Real market data (never mock)

## Development Setup

### Prerequisites
- Node.js 18+
- Python 3.9+
- Active Alpaca paper trading account
- Polygon.io API key

### Local Development
```bash
# Clone and setup
git clone https://github.com/mikedmote52/trading-dashboard.git
cd trading-dashboard

# Install dependencies
npm install
pip3 install pandas numpy requests yfinance

# Copy environment template
cp config/environment.example .env
# Edit .env with your API keys

# Start development server
npm start
```

### Testing Before Changes
```bash
# 1. Verify system health
curl http://localhost:3001/health

# 2. Test dashboard endpoint
curl http://localhost:3001/api/dashboard

# 3. Verify VIGL discovery works
python3 VIGL_Discovery_Complete.py

# 4. Check Recent Alerts functionality
# Open browser to http://localhost:3001 and verify Recent Alerts tile
```

## Code Standards

### Enhancement Guidelines
1. **Additive Only**: Add new features without breaking existing ones
2. **Real Data Only**: No mock data, simulations, or fake responses
3. **Performance First**: Maintain <2 second response times
4. **Error Handling**: Graceful degradation when APIs are unavailable

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-enhancement

# Make changes and test thoroughly
npm start  # Test locally
curl http://localhost:3001/api/dashboard  # Verify API

# Commit with descriptive message
git add .
git commit -m "Enhancement: Brief description

🎯 Detailed explanation of changes
- Specific improvements made  
- Impact on system performance
- Verification steps completed

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"

# Push and create PR
git push origin feature/your-enhancement
```

## File Organization

### Directory Structure
```
trading-dashboard/
├── server.js                    # Core API server
├── portfolio_intelligence.js    # Portfolio analysis
├── VIGL_Discovery_Complete.py  # Pattern detection
├── public/index.html            # Dashboard UI
├── config/                      # Configuration files
├── docs/                        # Documentation
├── scripts/                     # Executable scripts
├── utils/                       # Utility functions
└── tests/                       # Test suite
```

### Adding New Files
- **Scripts**: Add to `scripts/` directory
- **Utilities**: Add to `utils/` directory  
- **Documentation**: Add to `docs/` directory
- **Tests**: Add to appropriate `tests/` subdirectory

## API Enhancement Guidelines

### Adding New Endpoints
```javascript
// Always include error handling and logging
app.get('/api/new-endpoint', async (req, res) => {
    try {
        // Implementation
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('New endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

### Modifying Existing Endpoints
1. **Preserve existing response format**
2. **Add new fields without removing old ones**
3. **Maintain backward compatibility**
4. **Test with actual dashboard consumption**

## Testing Requirements

### Before Any Commit
1. **Local Functionality Test**: Verify all features work
2. **API Response Test**: Confirm all endpoints return expected data
3. **Performance Test**: Ensure response times remain fast
4. **Integration Test**: Test with live trading APIs

### Test Commands
```bash
# Test local server
npm start

# Test API endpoints
curl http://localhost:3001/health
curl http://localhost:3001/api/dashboard

# Test Python integration
python3 VIGL_Discovery_Complete.py

# Test portfolio intelligence
node -e "require('./portfolio_intelligence.js')"
```

## Deployment Safety

### Pre-Deployment Checklist
- [ ] All tests pass locally
- [ ] No breaking changes to existing APIs
- [ ] Performance meets standards (<2s response)
- [ ] Real data only, no mocks
- [ ] Error handling for edge cases
- [ ] Backward compatibility maintained

### Render Deployment
The system auto-deploys on git push to main. Always test locally first:

```bash
# Test locally before pushing
npm start
# Verify all functionality

# Deploy to production
git push origin main
# Monitor https://trading-dashboard-dvou.onrender.com
```

## Common Issues

### System Not Working After Changes
1. Check `server.log` for errors
2. Verify environment variables are set
3. Test API endpoints individually
4. Revert to last working commit if needed

### API Keys or External Service Issues
1. Verify API keys in environment
2. Check service status (Alpaca, Polygon)
3. Review rate limiting
4. Implement graceful fallbacks

## Support

- **Live System**: https://trading-dashboard-dvou.onrender.com
- **Documentation**: See `/docs` directory
- **Issues**: Create GitHub issues for bugs
- **Testing**: Always test before submitting changes

Remember: This is a working production system. Enhancement is encouraged, but system integrity is paramount.