#!/bin/bash
# Final verification script for Render portfolio fix

echo "🔍 VERIFYING RENDER PORTFOLIO FIX"
echo "=================================="
echo "Expected after fixing secret key:"
echo "  - API Key: PKX1WGCFOD3XXA9LBAR8 ✅"  
echo "  - Secret Key pattern: vCQUe...W3nR (currently: vCQUe...WT3nR ❌)"
echo ""

echo "1. Testing current secret key pattern on Render:"
SECRET_PATTERN=$(curl -s -H "Authorization: Bearer 656ccdf7a4a4b2412d47009cea9f43c7" \
  "https://trading-dashboard-dvou.onrender.com/api/admin/test-alpaca-direct" | \
  jq -r '.environment.secret_key_pattern')
echo "   Current: $SECRET_PATTERN"
echo "   Expected: vCQUe...W3nR"

if [ "$SECRET_PATTERN" = "vCQUe...W3nR" ]; then
  echo "   ✅ Secret key is correct!"
else
  echo "   ❌ Secret key still corrupted (has extra T)"
  echo ""
  echo "🔧 TO FIX:"
  echo "1. Go to Render Dashboard → Environment"
  echo "2. Update APCA_API_SECRET_KEY to: vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR"
  echo "3. Click 'Manual Deploy' → 'Clear build cache & deploy'"
  echo "4. Wait 3-5 minutes, then run this script again"
  exit 1
fi

echo ""
echo "2. Testing portfolio connection after fix:"
PORTFOLIO_RESULT=$(curl -s "https://trading-dashboard-dvou.onrender.com/api/dashboard" | \
  jq '.portfolio | {isConnected, positions: (.positions | length), totalValue}')
echo "$PORTFOLIO_RESULT"

IS_CONNECTED=$(echo "$PORTFOLIO_RESULT" | jq -r '.isConnected')
if [ "$IS_CONNECTED" = "true" ]; then
  echo "   ✅ Portfolio connection successful!"
  echo ""
  echo "🎉 RENDER DEPLOYMENT FULLY WORKING!"
  echo "   - VIGL discoveries: ✅"
  echo "   - Portfolio positions: ✅"
  echo "   - Authentication: ✅"
else
  echo "   ❌ Portfolio still not connecting"
  echo "   (May need additional manual restart)"
fi