#!/bin/bash
# Test Alpaca API with exact credentials from Render

echo "Testing Alpaca API directly with credentials..."
echo "================================================"

# Test with exact credentials
API_KEY="PKX1WGCFOD3XXA9LBAR8"
SECRET_KEY="vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR"
BASE_URL="https://paper-api.alpaca.markets"

echo -e "\n1. Testing Account endpoint:"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "APCA-API-KEY-ID: $API_KEY" \
  -H "APCA-API-SECRET-KEY: $SECRET_KEY" \
  "$BASE_URL/v2/account" | head -5

echo -e "\n2. Testing Positions endpoint:"
POSITIONS=$(curl -s \
  -H "APCA-API-KEY-ID: $API_KEY" \
  -H "APCA-API-SECRET-KEY: $SECRET_KEY" \
  "$BASE_URL/v2/positions")

echo "Positions found: $(echo $POSITIONS | jq '. | length')"

echo -e "\n3. Testing Clock endpoint (no auth required):"
curl -s "$BASE_URL/v2/clock" | jq '{is_open, state}'

echo -e "\n4. Testing from Render deployment:"
curl -s "https://trading-dashboard-dvou.onrender.com/api/dashboard" | \
  jq '.portfolio | {isConnected, positions: (.positions | length), totalValue}'

echo -e "\n5. Checking Render environment status:"
curl -s -H "Authorization: Bearer 656ccdf7a4a4b2412d47009cea9f43c7" \
  "https://trading-dashboard-dvou.onrender.com/api/admin/debug-alpaca" | \
  jq '.environment_vars'

echo -e "\n================================================"
echo "If credentials work locally but not on Render,"
echo "try Manual Deploy in Render dashboard to restart"