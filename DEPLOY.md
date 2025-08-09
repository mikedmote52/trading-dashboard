# Render Cloud Deployment Guide

## Prerequisites

1. **GitHub Repository**: Ensure your code is pushed to a GitHub repository
2. **Render Account**: Create account at https://render.com
3. **Environment Variables**: Prepare your API keys and configuration

## Render Service Configuration

### 1. Create New Web Service
- Connect your GitHub repository
- Branch: `deploy/render-hardening` (or `main` after merge)
- Build Command: `npm run render:build`
- Start Command: `npm run render:start`

### 2. Environment Variables
Set these in Render dashboard under "Environment":

```bash
# Required API Keys
POLYGON_API_KEY=your_polygon_api_key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key

# Production Configuration
NODE_ENV=production
PORT=10000

# Database (Render Persistent Disk)
SQLITE_DB_PATH=/opt/render/project/data/trading_dashboard.db

# Security
ADMIN_TOKEN=your-secure-random-token

# Trading Configuration
SCORING_WEIGHTS_JSON={"short_interest_weight":2.0,"borrow_fee_weight":1.5,"volume_weight":1.2,"momentum_weight":1.0,"catalyst_weight":0.8,"float_penalty_weight":-0.6}
```

### 3. Persistent Disk Setup
1. Create a new disk in Render dashboard
2. Size: 1GB (sufficient for SQLite database)
3. Mount path: `/opt/render/project/data`
4. Attach to your web service

## Health Checks

### System Health
```bash
GET /api/health
```

### Admin Status (requires auth)
```bash
GET /api/admin/status?token=YOUR_ADMIN_TOKEN
```

### Secure Scan Trigger (requires auth)
```bash
POST /api/admin/scan
Authorization: Bearer YOUR_ADMIN_TOKEN
```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Test database connection
npm run db:status

# Run manual discovery scan
npm run scan

# Check health
npm run health
```

## Production Monitoring

1. **Database Path**: Logs will show SQLite path on startup
2. **Capture Job**: Runs every 30 minutes automatically
3. **API Health**: Monitor `/api/health` endpoint
4. **Admin Access**: Use `/api/admin/status` with token

## Security Features

- **Token Authentication**: Admin endpoints require ADMIN_TOKEN
- **Environment Isolation**: Production uses separate environment variables
- **Secure Database**: SQLite database stored on persistent disk
- **Health Monitoring**: Built-in health checks and status reporting

## Troubleshooting

### Database Issues
```bash
# Check database initialization
curl https://your-app.onrender.com/api/health

# Check admin status (with token)
curl "https://your-app.onrender.com/api/admin/status?token=YOUR_TOKEN"
```

### Discovery Pipeline
```bash
# Trigger manual scan (with token)
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-app.onrender.com/api/admin/scan
```

### Logs
Monitor Render service logs for:
- Database path confirmation
- Capture job status
- API request handling
- Error messages