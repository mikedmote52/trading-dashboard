# Trading API Tests

This document provides curl examples to test the trading endpoints locally.

## Prerequisites

1. Start the server: `npm start`
2. Ensure environment variables are set:
   - `ALPACA_PAPER=1` (required for safety)
   - `ALPACA_KEY` and `ALPACA_SECRET` (your Alpaca API credentials)

## Test Commands

### 1. Buy Order Test
```bash
curl -X POST http://localhost:3001/api/trade/buy \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "dollars": 1000,
    "confidence": 0.8,
    "notes": "Test buy order via curl"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "decision_id": "abc123...",
  "order": {
    "id": "order_123",
    "status": "new",
    "qty": 6,
    "estimated_cost": 1000
  }
}
```

### 2. Adjust Position Test
```bash
curl -X POST http://localhost:3001/api/trade/adjust \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "deltaQty": 5,
    "notes": "Add 5 shares via curl test"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "decision_id": "def456...",
  "order": {
    "id": "order_456",
    "status": "new",
    "qty": 5,
    "side": "buy"
  }
}
```

### 3. Sell Order Test
```bash
curl -X POST http://localhost:3001/api/trade/sell \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "qty": 10,
    "notes": "Test sell order via curl"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "decision_id": "ghi789...",
  "order": {
    "id": "order_789",
    "status": "new",
    "qty": 10
  }
}
```

## Error Responses

### Policy Violation
If you exceed risk limits:
```json
{
  "error": "Policy violation",
  "reason": "Order exceeds max single order limit of $5000"
}
```

### Paper Mode Required
If `ALPACA_PAPER` is not set:
```json
{
  "error": "Trading requires ALPACA_PAPER=1 or explicit ALLOW_LIVE=1"
}
```

### Insufficient Shares
When trying to sell more than you own:
```json
{
  "error": "Insufficient shares",
  "available": 5,
  "requested": 10
}
```

## Testing the Learning Summary
```bash
curl -s http://localhost:3001/api/learning/summary | jq
```

This returns performance statistics bucketed by confidence levels from the last 30 days.

## Database Verification

After running the tests, you can verify the data was logged by checking the SQLite database:

```bash
sqlite3 trading_dashboard.db "SELECT * FROM decisions ORDER BY ts DESC LIMIT 5;"
sqlite3 trading_dashboard.db "SELECT * FROM orders ORDER BY ts DESC LIMIT 5;"
```

## UI Testing

The UI should now show trade buttons on:
- **Position cards**: "Buy More", "Reduce", "Close" buttons based on AI recommendations
- **Discovery cards**: "Buy Starter" button for recommended stocks

All buttons trigger optimistic UI updates followed by API calls to the trading endpoints.