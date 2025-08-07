#!/bin/bash

echo "🚀 Starting Your Daily Trading Intelligence Dashboard..."
echo ""

# Set environment variables for your APIs
export APCA_API_KEY_ID="PKX1WGCFOD3XXA9LBAR8"
export APCA_API_SECRET_KEY="vCQUe2hVPNLLvkw4DxviLEngZtk5zvCs7jsWT3nR" 
export APCA_API_BASE_URL="https://paper-api.alpaca.markets"
export POLYGON_API_KEY="nTXyESvlVLpQE3hKCJWtsS5BHkhAqq1C"

# Navigate to dashboard directory
cd /Users/michaelmote/Desktop/trading-dashboard

# Start the dashboard
echo "📊 Dashboard will open at: http://localhost:3001"
echo "🔍 VIGL Discovery: Connected to your working system"
echo "💼 Portfolio Management: Connected to Alpaca"
echo ""
echo "Press Ctrl+C to stop the dashboard"
echo ""

# Start the Node.js server
npm start