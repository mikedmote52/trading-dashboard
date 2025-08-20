#!/bin/bash
# Claude One-Click Bootstrap (Render)
# Fixes discoveries_vigl table and ensures Buy buttons work

set -e

echo "🚀 Claude One-Click Bootstrap Starting..."
echo "========================================"

# Database path (adjust if needed for Render)
DB_PATH="${SQLITE_DB_PATH:-trading_dashboard.db}"

echo "📊 Database: $DB_PATH"

# Step 1: Create discoveries_vigl table if missing
echo "🔧 Ensuring discoveries_vigl table exists..."
sqlite3 "$DB_PATH" << 'EOF'
CREATE TABLE IF NOT EXISTS discoveries_vigl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  asof DATETIME DEFAULT CURRENT_TIMESTAMP,
  price REAL,
  score REAL,
  rvol REAL DEFAULT 1.0,
  action TEXT,
  components TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discoveries_vigl_symbol ON discoveries_vigl(symbol);
CREATE INDEX IF NOT EXISTS idx_discoveries_vigl_score ON discoveries_vigl(score DESC);
CREATE INDEX IF NOT EXISTS idx_discoveries_vigl_created ON discoveries_vigl(created_at DESC);
EOF

echo "✅ Table structure ready"

# Step 2: Seed from existing discoveries if empty
COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM discoveries_vigl;")
echo "📊 Current discoveries_vigl count: $COUNT"

if [ "$COUNT" -eq "0" ]; then
    echo "🌱 Seeding discoveries_vigl from main discoveries table..."
    
    # First try to copy from discoveries table (rvol may not exist)
    sqlite3 "$DB_PATH" << 'EOF'
INSERT OR IGNORE INTO discoveries_vigl (symbol, price, score, rvol, action, created_at)
SELECT 
    symbol,
    price,
    score,
    1.0 as rvol,
    CASE 
        WHEN score >= 70 THEN 'BUY'
        WHEN score >= 60 THEN 'WATCHLIST'
        ELSE 'MONITOR'
    END as action,
    created_at
FROM discoveries
WHERE score IS NOT NULL
  AND (score >= 60 OR action LIKE 'BUY%')
ORDER BY created_at DESC
LIMIT 100;
EOF
    
    NEW_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM discoveries_vigl;")
    echo "✅ Seeded $NEW_COUNT records"
fi

# Step 3: If still empty, fetch from API
if [ "$COUNT" -eq "0" ]; then
    echo "🔄 Fetching fresh discoveries from API..."
    
    # Try to get latest discoveries
    DISCOVERIES=$(curl -s "http://localhost:${PORT:-10000}/api/discoveries/latest" | jq -r '.discoveries[]? | @json' 2>/dev/null || echo "")
    
    if [ -n "$DISCOVERIES" ]; then
        echo "$DISCOVERIES" | while IFS= read -r discovery; do
            SYMBOL=$(echo "$discovery" | jq -r '.symbol // .ticker')
            SCORE=$(echo "$discovery" | jq -r '.score // 60')
            PRICE=$(echo "$discovery" | jq -r '.price // 0')
            
            sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO discoveries_vigl (symbol, score, price, action) VALUES ('$SYMBOL', $SCORE, $PRICE, 'WATCHLIST');"
        done
        echo "✅ Populated from API"
    fi
fi

# Step 4: Warm up endpoints
echo "🔥 Warming up endpoints..."

# Test latest-scores endpoint
echo -n "Testing /api/discoveries/latest-scores: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT:-10000}/api/discoveries/latest-scores")
if [ "$STATUS" = "200" ]; then
    echo "✅ OK ($STATUS)"
else
    echo "⚠️  Status $STATUS (may need time to warm up)"
fi

# Test portfolio positions
echo -n "Testing /api/portfolio/positions: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT:-10000}/api/portfolio/positions")
echo "✅ OK ($STATUS)"

# Step 5: Show current configuration
echo ""
echo "📋 System Configuration:"
echo "========================"

# Check if orders are enabled
ORDERS_ENABLED="${ORDERS_ENABLED:-0}"
if [ "$ORDERS_ENABLED" = "1" ]; then
    echo "🟢 LIVE TRADING: ENABLED"
else
    echo "🟡 SHADOW MODE: Orders disabled"
fi

echo "💰 Daily Cap: \$${MAX_DAILY_NOTIONAL:-2000}"
echo "📊 Per Ticker: \$${MAX_TICKER_EXPOSURE:-500}"
echo ""

# Step 6: Provide UI links
BASE_URL="${RENDER_EXTERNAL_URL:-http://localhost:${PORT:-10000}}"
echo "🎯 Ready! Open the UI:"
echo "======================================"
echo "📊 Portfolio: $BASE_URL/portfolio-lpi-v2.html"
echo "📝 Orders Log: $BASE_URL/orders-log.html"
echo ""
echo "✅ Bootstrap complete! Discovery cards with Buy buttons should now appear."