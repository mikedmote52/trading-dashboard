#\!/bin/bash
# Check if APCA_API_SECRET_KEY on Render matches expected value
echo "Testing if Render has the correct secret key..."
echo "Expected: vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR"

# Make direct API call to check secret key mismatch
curl -s -H "Authorization: Bearer 656ccdf7a4a4b2412d47009cea9f43c7" \
  "https://trading-dashboard-dvou.onrender.com/api/admin/debug-alpaca-403" | \
  jq -r ".environment_vars.secret_key_check // \"No secret key check available\""

