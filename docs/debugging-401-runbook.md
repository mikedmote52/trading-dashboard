# 401 API Debugging Runbook

## Quick Health Check: When someone asks "why 401?"

### Step 1: Hit the debug endpoint
```bash
curl -s http://localhost:3005/api/discoveries/_debug/http | jq .
```

**What to look for:**
- `envLens.polyLen > 0` - Polygon API key is present
- `dataBase: "https://data.alpaca.markets"` - Correct Alpaca data endpoint
- `tradingBase: "https://paper-api.alpaca.markets"` - Correct trading endpoint
- `screener` object shows last run metadata

### Step 2: Inspect screener logs
Look for these patterns in recent logs:

**HTTP Traces:**
```
[http-trace:polygon] GET https://api.polygon.io/... params={...} keyLen=32 tail=1234
[http-resp:polygon] status=401 body[:120]={"error":"invalid key","message":"..."}
```

**Metrics Output:**
```
[metrics] {"polygon_http_200": 5, "polygon_http_401": 1, "polygon_live_fail": 1}
```

### Step 3: Confirm fallback behavior
Even with 401s, the system should show:
- `[screener] wrote N items ... (source=cached)` 
- UI stays green with cached discoveries
- `/api/discoveries/latest` returns non-empty array

## Common 401 Root Causes

### Issue: Invalid API Key
**Symptoms:** `status=401 body=invalid key`
**Fix:** Check `POLYGON_API_KEY` environment variable
```bash
echo "Key length: ${#POLYGON_API_KEY} chars, tail: ${POLYGON_API_KEY: -4}"
```

### Issue: Wrong Headers
**Symptoms:** `status=401 body=unauthorized`  
**Fix:** Verify only `X-Polygon-API-Key` header is sent, no `Authorization`

### Issue: Endpoint Not Covered by Plan
**Symptoms:** `status=401 body=plan required`
**Fix:** Switch to reference endpoints or use Alpaca data instead

### Issue: Rate Limiting Appearing as 401
**Symptoms:** Intermittent 401s under load
**Fix:** Check if it's actually 429 (rate limit) being misreported

## Circuit Breaker Status

When 401s are detected, the circuit breaker activates:
```
[cb] polygon 401 detected, circuit open for 5 minutes  
[cb] polygon circuit open; forcing cached-only run
```

**Manual Control:**
```bash
# Force cached mode for debugging
UNIVERSE_MODE=cached npm start

# Force live mode (will error if 401s persist)  
UNIVERSE_MODE=live npm start

# Default auto mode (try live, fallback cached)
UNIVERSE_MODE=auto npm start
```

## Health Monitoring

### Key Metrics to Track
- `polygon_http_200_total` - Successful API calls
- `polygon_http_401_total` - Authentication failures  
- `screener_source{source="cached"}` - Fallback usage rate
- `discoveries_inserted_total` - Actual discovery pipeline output

### Alert Conditions
- **Warning:** `polygon_http_401_total` increases AND `screener_source{cached} > 80%` for >15 minutes
- **Critical:** No new discoveries inserted for >30 minutes

## Manual Recovery Steps

### 1. Temporary Cached Mode
```bash  
# Silence live API calls during provider incidents
export UNIVERSE_MODE=cached
systemctl restart trading-dashboard
```

### 2. Test New API Key
```bash
# Test key directly
curl -H "X-Polygon-API-Key: $NEW_KEY" "https://api.polygon.io/v3/reference/tickers?limit=1"
```

### 3. Reset Circuit Breaker
```bash
# Restart service to clear circuit breaker state
systemctl restart trading-dashboard
```

### 4. Verify Recovery
```bash
# Check that discoveries are flowing
curl -s http://localhost:3005/api/discoveries/latest | jq '.count'

# Verify live API working
curl -s http://localhost:3005/api/discoveries/_debug/http | jq '.screener.stderr' | grep "polygon_http_200"
```

## Log Analysis Commands

```bash
# Find all HTTP traces in last hour
journalctl -u trading-dashboard --since="1 hour ago" | grep "http-trace:polygon"

# Count API status codes today  
journalctl -u trading-dashboard --since="today" | grep "http-resp:polygon" | grep -o "status=[0-9]*" | sort | uniq -c

# Extract metrics from recent runs
journalctl -u trading-dashboard --since="1 hour ago" | grep "\\[metrics\\]" | tail -5

# Check circuit breaker activations
journalctl -u trading-dashboard --since="today" | grep "\\[cb\\]"
```

## Expected Behavior During 401s

✅ **What should happen:**
- HTTP traces show `status=401` with reason
- Circuit breaker opens (`[cb] polygon circuit open`)
- System falls back to cached data
- Discoveries continue flowing from cache
- UI remains green and functional
- Metrics clearly show fallback ratio

❌ **What should NOT happen:**
- Complete system failure
- Empty discovery arrays  
- UI showing loading/error states
- Missing fallback behavior
- Silent failures without logs

## Monitoring Dashboard Queries

```prometheus
# API Success Rate
rate(polygon_http_200_total[5m]) / rate(polygon_http_total[5m])

# Fallback Usage  
rate(screener_source{source="cached"}[5m]) / rate(screener_runs_total[5m])

# Discovery Pipeline Health
rate(discoveries_inserted_total[5m])
```