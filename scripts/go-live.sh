#!/bin/bash
# Trading Dashboard Go-Live Script
# Execute during market hours (9:35 AM - 3:50 PM ET)

set -e

echo "🚀 TRADING DASHBOARD GO-LIVE SEQUENCE"
echo "======================================"

# Check market hours (9:35 AM - 3:50 PM ET)
current_hour=$(TZ=America/New_York date +%H)
current_minute=$(TZ=America/New_York date +%M)
current_time="${current_hour}:${current_minute}"

echo "Current ET Time: $current_time"

if [[ $current_hour -lt 9 ]] || [[ $current_hour -eq 9 && $current_minute -lt 35 ]] || [[ $current_hour -gt 15 ]] || [[ $current_hour -eq 15 && $current_minute -gt 50 ]]; then
    echo "❌ ABORT: Outside trading hours (9:35 AM - 3:50 PM ET)"
    exit 1
fi

echo "✅ Trading hours confirmed"

# Step 1: Commit conservative risk parameters
echo "📋 Step 1: Committing conservative risk parameters..."
git add render.yaml
git commit -m "feat: add conservative risk parameters for go-live

- MAX_DAILY_NOTIONAL: $500 (reduced from $2000)  
- MAX_TICKER_EXPOSURE: $150 (reduced from $500)
- Prepared for controlled live trading activation

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push

echo "✅ Conservative parameters deployed"
sleep 5

# Step 2: Enable live trading
echo "📋 Step 2: Enabling live trading..."
sed -i '' 's/value: "0"/value: "1"/' render.yaml

git add render.yaml  
git commit -m "🚀 ENABLE LIVE TRADING

CRITICAL: System now placing real orders
- ORDERS_ENABLED: 0 → 1
- Conservative caps: \$500 daily, \$150 per ticker
- Paper trading → Live execution

Monitor immediately: /orders-log.html

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push

echo "🚀 LIVE TRADING ACTIVATED!"
echo ""
echo "Next Steps:"
echo "1. Monitor: https://trading-dashboard-dvou.onrender.com/orders-log.html"
echo "2. First order: Use BUY_MORE button on high-confidence signal"  
echo "3. Verify bracket orders in Alpaca"
echo "4. Track KPIs: TP1 hit rate ≥45%, avg 1h P&L ≥+0.3R"
echo ""
echo "🔒 EMERGENCY STOP: ORDERS_ENABLED=0 + restart"