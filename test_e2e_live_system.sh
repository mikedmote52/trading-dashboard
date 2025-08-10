#!/bin/bash
# End-to-End Live System Test for Trading Dashboard
# Tests both VIGL discoveries and portfolio management

echo "🚀 TRADING DASHBOARD END-TO-END TEST"
echo "===================================="
echo "Testing: https://trading-dashboard-dvou.onrender.com"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test an endpoint
test_endpoint() {
    local NAME=$1
    local URL=$2
    local EXPECTED_STATUS=$3
    local CHECK_FIELD=$4
    
    echo -n "Testing $NAME... "
    
    RESPONSE=$(curl -s -w "\n%{http_code}" "$URL")
    STATUS=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | head -n -1)
    
    if [ "$STATUS" = "$EXPECTED_STATUS" ]; then
        if [ -n "$CHECK_FIELD" ]; then
            VALUE=$(echo "$BODY" | jq -r "$CHECK_FIELD" 2>/dev/null)
            if [ "$VALUE" != "null" ] && [ "$VALUE" != "" ]; then
                echo -e "${GREEN}✅ PASS${NC} (Status: $STATUS, $CHECK_FIELD: $VALUE)"
                ((TESTS_PASSED++))
            else
                echo -e "${RED}❌ FAIL${NC} (Status OK but missing data: $CHECK_FIELD)"
                ((TESTS_FAILED++))
            fi
        else
            echo -e "${GREEN}✅ PASS${NC} (Status: $STATUS)"
            ((TESTS_PASSED++))
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (Expected: $EXPECTED_STATUS, Got: $STATUS)"
        ((TESTS_FAILED++))
    fi
}

echo "1️⃣  API HEALTH CHECKS"
echo "------------------------------------"
test_endpoint "Health Check" "https://trading-dashboard-dvou.onrender.com/api/health" "200" ".status"

echo ""
echo "2️⃣  VIGL DISCOVERY SYSTEM"
echo "------------------------------------"

# Test VIGL discoveries endpoint
DISCOVERIES=$(curl -s "https://trading-dashboard-dvou.onrender.com/api/discoveries/latest")
DISCOVERY_COUNT=$(echo "$DISCOVERIES" | jq '.discoveries | length')
echo -n "VIGL Discoveries... "
if [ "$DISCOVERY_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} ($DISCOVERY_COUNT discoveries found)"
    ((TESTS_PASSED++))
    
    # Check for real market data (not placeholder $50 prices)
    FIRST_PRICE=$(echo "$DISCOVERIES" | jq '.discoveries[0].currentPrice')
    echo -n "Real Market Prices... "
    if [ "$FIRST_PRICE" != "50" ] && [ "$FIRST_PRICE" != "null" ]; then
        echo -e "${GREEN}✅ PASS${NC} (First price: \$$FIRST_PRICE)"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC} (Placeholder price detected: \$$FIRST_PRICE)"
        ((TESTS_FAILED++))
    fi
    
    # Check for VIGL pattern scoring
    FIRST_SCORE=$(echo "$DISCOVERIES" | jq '.discoveries[0].viglScore')
    echo -n "VIGL Pattern Scoring... "
    if [ "$FIRST_SCORE" != "null" ]; then
        echo -e "${GREEN}✅ PASS${NC} (Score: $FIRST_SCORE)"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠️  WARN${NC} (No VIGL scores found)"
    fi
else
    echo -e "${RED}❌ FAIL${NC} (No discoveries found)"
    ((TESTS_FAILED++))
fi

echo ""
echo "3️⃣  PORTFOLIO MANAGEMENT"
echo "------------------------------------"

# Test portfolio endpoint
PORTFOLIO=$(curl -s "https://trading-dashboard-dvou.onrender.com/api/dashboard")
IS_CONNECTED=$(echo "$PORTFOLIO" | jq -r '.portfolio.isConnected')
POSITION_COUNT=$(echo "$PORTFOLIO" | jq '.portfolio.positions | length')
TOTAL_VALUE=$(echo "$PORTFOLIO" | jq -r '.portfolio.totalValue')

echo -n "Alpaca Connection... "
if [ "$IS_CONNECTED" = "true" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ FAIL${NC} (Not connected)"
    ((TESTS_FAILED++))
fi

echo -n "Portfolio Positions... "
if [ "$POSITION_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} ($POSITION_COUNT positions, Total: \$$TOTAL_VALUE)"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (No positions found)"
fi

echo ""
echo "4️⃣  DATA FRESHNESS"
echo "------------------------------------"

# Check if data is recent (within last hour)
if [ "$DISCOVERY_COUNT" -gt 0 ]; then
    LATEST_TIME=$(echo "$DISCOVERIES" | jq -r '.discoveries[0].discoveredAt')
    if [ "$LATEST_TIME" != "null" ]; then
        CURRENT_EPOCH=$(date +%s)
        DISCOVERY_EPOCH=$(date -d "$LATEST_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$LATEST_TIME" +%s 2>/dev/null)
        
        if [ -n "$DISCOVERY_EPOCH" ]; then
            AGE=$((CURRENT_EPOCH - DISCOVERY_EPOCH))
            echo -n "Data Freshness... "
            if [ "$AGE" -lt 3600 ]; then
                echo -e "${GREEN}✅ PASS${NC} (Updated $(($AGE / 60)) minutes ago)"
                ((TESTS_PASSED++))
            elif [ "$AGE" -lt 86400 ]; then
                echo -e "${YELLOW}⚠️  WARN${NC} (Updated $(($AGE / 3600)) hours ago)"
            else
                echo -e "${RED}❌ FAIL${NC} (Data is $(($AGE / 86400)) days old)"
                ((TESTS_FAILED++))
            fi
        fi
    fi
fi

echo ""
echo "5️⃣  PERFORMANCE METRICS"
echo "------------------------------------"

# Test response times
START_TIME=$(date +%s%N)
curl -s "https://trading-dashboard-dvou.onrender.com/api/discoveries/latest" > /dev/null
END_TIME=$(date +%s%N)
RESPONSE_TIME=$(( ($END_TIME - $START_TIME) / 1000000 ))

echo -n "API Response Time... "
if [ "$RESPONSE_TIME" -lt 1000 ]; then
    echo -e "${GREEN}✅ FAST${NC} (${RESPONSE_TIME}ms)"
    ((TESTS_PASSED++))
elif [ "$RESPONSE_TIME" -lt 3000 ]; then
    echo -e "${YELLOW}⚠️  MODERATE${NC} (${RESPONSE_TIME}ms)"
else
    echo -e "${RED}❌ SLOW${NC} (${RESPONSE_TIME}ms)"
    ((TESTS_FAILED++))
fi

echo ""
echo "===================================="
echo "📊 TEST SUMMARY"
echo "===================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL SYSTEMS OPERATIONAL!${NC}"
    echo "Dashboard: https://trading-dashboard-dvou.onrender.com"
    exit 0
else
    echo -e "\n${RED}⚠️  SYSTEM ISSUES DETECTED${NC}"
    echo "Please check the failed tests above"
    exit 1
fi