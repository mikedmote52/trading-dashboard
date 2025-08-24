# Deployment Verification Guide

This guide helps you verify that your code changes are actually deployed to Render services.

## 🔍 Quick Verification

### 1. Check Build Stamps in Logs

After deploying, check the boot logs for both services:

**Web Service:**
```
[boot-stamp] { ts: "2025-08-24T07:07:40.326Z", gitSha: "2637da655419", service: "web" }
```

**Worker Service:**
```
[boot-stamp] { ts: "2025-08-24T07:07:40.326Z", gitSha: "2637da655419", service: "worker" }
```

### 2. Check Version Endpoint

Hit the version endpoint on your web service:

```bash
curl -s https://your-render-app.onrender.com/api/_debug/version | jq
```

Expected response:
```json
{
  "stamp": {
    "ts": "2025-08-24T07:07:40.326Z",
    "gitSha": "2637da655419",
    "gitBranch": "main",
    "service": "web",
    "node": "v18.x.x",
    "buildId": "2637da655419-1756019260326"
  },
  "env": {
    "service": "web",
    "port": "10000",
    "branch": "main",
    "commit": "2637da655419abc...",
    "node_env": "production"
  },
  "uptime": 3600,
  "timestamp": "2025-08-24T08:00:00.000Z"
}
```

### 3. Compare Git SHA

Compare the `gitSha` from the version endpoint with your latest commit:

```bash
# Your local commit
git rev-parse --short=12 HEAD

# Should match the gitSha in the version endpoint
```

## 🛠 Build Commands for Render

### Web Service
```
Build Command: node scripts/write_build_stamp.js && npm ci
Start Command: npm run render:start
```

### Worker Service
```
Build Command: node scripts/write_build_stamp.js && npm ci
Start Command: ROLE=worker npm run render:start
```

## 🔧 Environment Variables

Set these in your Render dashboard:

### Both Services
- `POLYGON_API_KEY`: Your Polygon.io API key
- `APCA_API_KEY_ID`: Alpaca paper trading API key ID
- `APCA_API_SECRET_KEY`: Alpaca paper trading secret key
- `ALPACA_TRADING_BASE`: `https://paper-api.alpaca.markets`
- `ALPACA_DATA_BASE`: `https://data.alpaca.markets`
- `NODE_ENV`: `production`
- `STRICT_STARTUP`: `false`
- `SCREENER_STRICT_FEEDS`: `false`

### Web Service Only
- `SERVICE_ROLE`: `web`

### Worker Service Only
- `SERVICE_ROLE`: `worker`
- `ROLE`: `worker`
- `OUTCOME_LABELER_ENABLED`: `true`

## ❌ Common Issues

### Deployment Not Updating
- **Wrong branch**: Check if Render is tracking the correct branch (usually `main`)
- **Auto Deploy disabled**: Enable Auto Deploy in Render dashboard
- **Build failed**: Check build logs in Render dashboard
- **Cache issues**: Try Manual Deploy in Render dashboard

### Version Mismatch
- **Local vs Remote**: Run `git push origin main` to ensure remote has your changes
- **Worker vs Web**: Both services need to be deployed separately
- **Environment**: Check `RENDER_GIT_COMMIT` and `RENDER_GIT_BRANCH` env vars

### Endpoint Not Found
- **Wrong URL**: Use the correct Render app URL
- **Service not deployed**: Check if web service is running
- **Route not mounted**: Verify the debug route is properly mounted

## 🚀 Force Deployment

If changes aren't showing up:

1. **Push to correct branch**:
   ```bash
   git push origin main
   ```

2. **Manual Deploy** in Render dashboard:
   - Go to your service → Deploy → Manual Deploy

3. **Check both services**:
   - Web service needs redeployment for API changes
   - Worker service needs redeployment for background job changes

## ✅ Success Checklist

- [ ] Build stamp appears in both web and worker logs
- [ ] Version endpoint returns correct `gitSha`
- [ ] `gitSha` matches your latest local commit
- [ ] Both services show correct `SERVICE_ROLE`
- [ ] Python canary logs show expected version
- [ ] Outcomes API returns data (after labeling runs)