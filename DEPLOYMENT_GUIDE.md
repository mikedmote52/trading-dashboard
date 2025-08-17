# 🚀 Trading Dashboard - Production Deployment Guide

## System Status
✅ **DEPLOYMENT READY** - All systems tested and fortified

## Pre-Deployment Checklist
- [x] Stable branch created: `stable-working-system`
- [x] All tests passing and system verified
- [x] Production middleware implemented
- [x] Health check endpoint active
- [x] Rate limiting configured
- [x] Error handling fortified
- [x] Deployment configuration updated

## Architecture Overview
```
Unified Trading Dashboard
├── Portfolio Management (Alpaca API)
├── VIGL Discovery System (Python + SQLite)
├── AlphaStack Universe Screener (Real-time)
└── Fortified Production Middleware
```

## Deployment Instructions

### Option 1: Render Dashboard (Recommended)
1. **Connect Repository**
   - Go to Render Dashboard
   - Connect `trading-dashboard` repository
   - Select `stable-working-system` branch

2. **Configure Service**
   - Use the included `render.yaml` configuration
   - Set environment variables (see below)
   - Deploy as Web Service

3. **Environment Variables** (Set in Render Dashboard)
   ```
   POLYGON_API_KEY=your_polygon_key
   APCA_API_KEY_ID=your_alpaca_key  
   APCA_API_SECRET_KEY=your_alpaca_secret
   ADMIN_TOKEN=your_secure_admin_token
   NODE_ENV=production
   SERVE_STATIC=true
   ```

### Option 2: Manual Deployment
```bash
# Clone and setup
git clone https://github.com/mikedmote52/trading-dashboard.git
cd trading-dashboard
git checkout stable-working-system

# Install dependencies
npm install
pip3 install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your API keys

# Run deployment check
npm run health

# Start production server
npm run render:start
```

## Health Monitoring

### Health Check Endpoint
```bash
curl https://your-app.onrender.com/api/health
```

### Expected Response
```json
{
  "status": "healthy",
  "uptime": 1234,
  "checks": {
    "database": {"status": "healthy"},
    "python": {"status": "healthy"}, 
    "files": {"status": "healthy"},
    "environment": {"status": "healthy"}
  }
}
```

## System Features

### Production Middleware
- **Rate Limiting**: Protects against API abuse
- **Error Handling**: Graceful degradation and logging
- **Health Monitoring**: Real-time system status
- **Security**: Input validation and authentication

### Trading Systems
- **Real Portfolio**: Live Alpaca paper trading integration
- **VIGL Discovery**: Proven pattern detection (324% winner)
- **AlphaStack**: Full universe screening (4,892 symbols)
- **Risk Management**: WOLF pattern detection

### Performance Optimizations
- **Caching**: Parquet-based feature storage
- **Rate Limiting**: API call optimization
- **Memory Management**: Efficient data processing
- **Background Jobs**: Non-blocking data collection

## URLs and Endpoints

### Main Application
- **Dashboard**: `https://your-app.onrender.com`
- **Health Check**: `https://your-app.onrender.com/api/health`

### API Endpoints
- Portfolio: `/api/dashboard`
- AlphaStack Scan: `/api/alphastack/scan`
- VIGL Discovery: `/api/discoveries`

## Troubleshooting

### Common Issues
1. **Environment Variables**: Check all required vars are set
2. **Python Dependencies**: Ensure pandas, numpy, pyarrow installed
3. **Database**: SQLite will auto-create on first run
4. **API Keys**: Verify Polygon and Alpaca keys are valid

### Logs and Monitoring
- Check Render logs for startup errors
- Health endpoint shows detailed system status
- Rate limiting logs API usage patterns

## Zero-Downtime Updates
1. Test changes on development branch
2. Merge to `stable-working-system`
3. Deploy via Render (automatic or manual)
4. Monitor health endpoint during deployment

## Security Notes
- All API keys stored as environment variables
- Rate limiting prevents abuse
- Error responses don't leak sensitive information
- HTTPS enforced in production

---

**Status**: ✅ READY FOR PRODUCTION DEPLOYMENT
**Branch**: `stable-working-system`
**Last Updated**: August 17, 2025