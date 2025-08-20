#!/bin/bash
# Emergency Trading Stop Script
# Use if any issues during live trading

set -e

echo "🛑 EMERGENCY TRADING STOP"
echo "========================="

# Disable live trading immediately
echo "🔒 Disabling live trading..."
sed -i '' 's/value: "1"/value: "0"/' render.yaml

git add render.yaml
git commit -m "🛑 EMERGENCY STOP: Disable live trading

ORDERS_ENABLED: 1 → 0
System returned to shadow mode

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push

echo "✅ TRADING DISABLED - System in shadow mode"
echo ""
echo "Status:"  
echo "- ORDERS_ENABLED=0 (shadow mode)"
echo "- All future orders will be dry-run only"
echo "- Existing positions remain active"
echo ""
echo "Monitor recovery: https://trading-dashboard-dvou.onrender.com/orders-log.html"