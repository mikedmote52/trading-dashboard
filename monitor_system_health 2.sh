#!/bin/bash
# Continuous health monitoring for Trading Dashboard
# Runs periodic checks and alerts on issues

RENDER_URL="https://trading-dashboard-dvou.onrender.com"
CHECK_INTERVAL=300  # 5 minutes
ALERT_THRESHOLD=2   # Number of failures before alerting

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
DISCOVERY_FAILURES=0
PORTFOLIO_FAILURES=0
LAST_CHECK_TIME=""

log_status() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_discoveries() {
    local RESULT=$(curl -s "$RENDER_URL/api/discoveries/latest")
    local COUNT=$(echo "$RESULT" | jq '.discoveries | length' 2>/dev/null)
    local FIRST_PRICE=$(echo "$RESULT" | jq '.discoveries[0].currentPrice' 2>/dev/null)
    
    if [ "$COUNT" -gt 0 ] && [ "$FIRST_PRICE" != "null" ] && [ "$FIRST_PRICE" != "50" ]; then
        echo -e "${GREEN}✅${NC} Discoveries: $COUNT found, Price: \$$FIRST_PRICE"
        DISCOVERY_FAILURES=0
        return 0
    else
        echo -e "${RED}❌${NC} Discoveries: Issues detected (Count: $COUNT, Price: $FIRST_PRICE)"
        ((DISCOVERY_FAILURES++))
        return 1
    fi
}

check_portfolio() {
    local RESULT=$(curl -s "$RENDER_URL/api/dashboard")
    local IS_CONNECTED=$(echo "$RESULT" | jq -r '.portfolio.isConnected' 2>/dev/null)
    local POSITIONS=$(echo "$RESULT" | jq '.portfolio.positions | length' 2>/dev/null)
    local VALUE=$(echo "$RESULT" | jq -r '.portfolio.totalValue' 2>/dev/null)
    
    if [ "$IS_CONNECTED" = "true" ] && [ "$POSITIONS" -gt 0 ]; then
        echo -e "${GREEN}✅${NC} Portfolio: Connected, $POSITIONS positions, \$$VALUE"
        PORTFOLIO_FAILURES=0
        return 0
    else
        echo -e "${RED}❌${NC} Portfolio: Connection issues"
        ((PORTFOLIO_FAILURES++))
        return 1
    fi
}

check_data_freshness() {
    local RESULT=$(curl -s "$RENDER_URL/api/discoveries/latest")
    local LATEST_TIME=$(echo "$RESULT" | jq -r '.discoveries[0].created_at' 2>/dev/null)
    
    if [ "$LATEST_TIME" != "null" ]; then
        # Calculate age in hours
        local CURRENT_EPOCH=$(date +%s)
        local DISCOVERY_EPOCH=$(date -d "$LATEST_TIME" +%s 2>/dev/null || echo "0")
        
        if [ "$DISCOVERY_EPOCH" -gt 0 ]; then
            local AGE_HOURS=$(( (CURRENT_EPOCH - DISCOVERY_EPOCH) / 3600 ))
            
            if [ "$AGE_HOURS" -lt 24 ]; then
                echo -e "${GREEN}✅${NC} Data Freshness: Updated $AGE_HOURS hours ago"
                return 0
            else
                echo -e "${YELLOW}⚠️${NC} Data Freshness: $AGE_HOURS hours old"
                return 1
            fi
        fi
    fi
    
    echo -e "${RED}❌${NC} Data Freshness: Cannot determine"
    return 1
}

send_alert() {
    local MESSAGE=$1
    log_status "🚨 ALERT: $MESSAGE"
    
    # Here you could add:
    # - Email notification
    # - Slack webhook
    # - SMS alert
    # - PagerDuty integration
    
    # For now, just log to file
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $MESSAGE" >> monitoring_alerts.log
}

run_health_check() {
    echo ""
    log_status "Running health check..."
    echo "------------------------------------"
    
    local ISSUES=0
    
    # Check discoveries
    if ! check_discoveries; then
        ((ISSUES++))
        if [ "$DISCOVERY_FAILURES" -ge "$ALERT_THRESHOLD" ]; then
            send_alert "VIGL Discovery system has failed $DISCOVERY_FAILURES consecutive checks"
        fi
    fi
    
    # Check portfolio
    if ! check_portfolio; then
        ((ISSUES++))
        if [ "$PORTFOLIO_FAILURES" -ge "$ALERT_THRESHOLD" ]; then
            send_alert "Portfolio connection has failed $PORTFOLIO_FAILURES consecutive checks"
        fi
    fi
    
    # Check data freshness
    if ! check_data_freshness; then
        ((ISSUES++))
    fi
    
    # Summary
    echo "------------------------------------"
    if [ "$ISSUES" -eq 0 ]; then
        log_status "All systems operational ✅"
    else
        log_status "$ISSUES system(s) with issues ⚠️"
    fi
    
    LAST_CHECK_TIME=$(date '+%Y-%m-%d %H:%M:%S')
}

# Main monitoring loop
main() {
    log_status "Starting Trading Dashboard Health Monitor"
    log_status "URL: $RENDER_URL"
    log_status "Check interval: ${CHECK_INTERVAL}s"
    echo ""
    
    # Run initial check
    run_health_check
    
    # Continuous monitoring
    while true; do
        sleep "$CHECK_INTERVAL"
        run_health_check
    done
}

# Handle interrupts gracefully
trap 'log_status "Monitoring stopped"; exit 0' INT TERM

# Start monitoring
main