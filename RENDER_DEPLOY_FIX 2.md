# Fix Render Portfolio Connection - Manual Deploy Required

## Current Status
- ✅ API Key corrected: `PKX1WGCFOD3XXA9LBAR8`
- ✅ Environment variables set correctly
- ✅ Credentials work locally (3 positions, $100,488.55)
- ❌ Render still returns 403 Forbidden

## Root Cause
The Render server process is using **cached environment variables** from when the API key was wrong. Even though the environment variables are updated in Render's dashboard, the running Node.js process hasn't reloaded them.

## SOLUTION: Force Full Restart

### Option 1: Manual Deploy (Recommended)
1. Go to Render Dashboard
2. Click on your service
3. Click **"Manual Deploy"** button
4. Select **"Clear build cache & deploy"**
5. Wait for deployment to complete (3-5 minutes)

### Option 2: Restart Service
1. Go to Render Dashboard
2. Click on your service
3. Click **"Restart"** button (if available)

### Option 3: Trigger via Git
```bash
# Make a small change to force redeploy
echo "# Deploy trigger $(date)" >> README.md
git add README.md
git commit -m "Trigger Render redeploy to reload environment variables"
git push origin main
```

## Verification After Deploy

Run this command to verify portfolio is working:
```bash
curl -s "https://trading-dashboard-dvou.onrender.com/api/dashboard" | \
  jq '.portfolio | {isConnected, positions: (.positions | length), totalValue}'
```

Expected result:
```json
{
  "isConnected": true,
  "positions": 3,
  "totalValue": "100488.55"
}
```

## Why This Happens
When environment variables are updated in Render:
1. The new values are stored in Render's system
2. But the running Node.js process continues using old cached values
3. Only a full restart/redeploy loads the new values into the process

## Quick Test
After redeployment, the portfolio section should show:
- 3 positions (BTAI and others)
- Total value: $100,488.55
- Connected status: ✅

The VIGL discoveries are already working, so once the portfolio connects, the full dashboard will be operational!