# Fix Render Environment Variables for Portfolio Positions

## Issue Diagnosed ✅
- **Local environment**: Portfolio works (3 positions, $100,488.55 value)
- **Live deployment**: No portfolio connection (`isConnected: false`)
- **Root cause**: Missing Alpaca API credentials on Render

## Solution Steps

### 1. Add Environment Variables to Render

Go to your Render dashboard → Service → Environment tab and add:

```bash
# Alpaca Trading API (REQUIRED - exact names)
APCA_API_KEY_ID=PKX1WGCFOD3XXA9LBAR8
APCA_API_SECRET_KEY=vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR
APCA_API_BASE_URL=https://paper-api.alpaca.markets

# Market Data API (should already exist)
POLYGON_API_KEY=p50INptuiQ05FW6FwGREFqo8dSzcuq36

# Admin Token (should already exist)  
ADMIN_TOKEN=656ccdf7a4a4b2412d47009cea9f43c7

# Database Path (should already exist)
SQLITE_DB_PATH=/var/data/trading_dashboard.db
```

### 2. Critical Notes

**⚠️ Variable Names Must Be Exact:**
- Use `APCA_API_KEY_ID` (NOT `ALPACA_API_KEY`)
- Use `APCA_API_SECRET_KEY` (NOT `ALPACA_SECRET_KEY`)
- Use `APCA_API_BASE_URL` (NOT `ALPACA_BASE_URL`)

### 3. Restart Service

After adding variables:
1. Go to Render dashboard
2. Click "Manual Deploy" or wait for auto-deploy
3. Monitor deployment logs for Alpaca connection success

### 4. Verify Fix

Test the live deployment:
```bash
curl -s "https://trading-dashboard-dvou.onrender.com/api/dashboard" | jq '.portfolio | {isConnected, positions_count: (.positions | length), totalValue}'
```

Expected result after fix:
```json
{
  "isConnected": true,
  "positions_count": 3,
  "totalValue": "100488.55"
}
```

## Environment Variable Template

Copy this to Render environment variables:

```
APCA_API_KEY_ID=PKX1WGCFOD3XXA9LBAR8
APCA_API_SECRET_KEY=vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR  
APCA_API_BASE_URL=https://paper-api.alpaca.markets
POLYGON_API_KEY=p50INptuiQ05FW6FwGREFqo8dSzcuq36
ADMIN_TOKEN=656ccdf7a4a4b2412d47009cea9f43c7
SQLITE_DB_PATH=/var/data/trading_dashboard.db
```

## Expected Behavior After Fix

✅ **Frontend will show:**
- Portfolio positions (3 positions)
- Real market values ($100K+ total)
- BTAI, and other actual positions
- Risk analysis and thesis for each position
- Connected status indicator

✅ **Backend will log:**
- "🔗 Alpaca Connected: true"
- "✅ Found 3 real positions from Alpaca"
- Successful position data processing

## Verification Commands

```bash
# Test API connection
node debug_frontend_portfolio.js

# Check live deployment directly
curl "https://trading-dashboard-dvou.onrender.com/api/dashboard" | jq .portfolio.isConnected
```

The frontend code is working correctly - it just needs real data from the backend!