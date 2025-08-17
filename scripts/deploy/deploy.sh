#!/bin/bash
# Quick Deploy Script - Blue/Green Deployment Operations
# Simplified interface for common deployment operations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

error() {
    echo -e "${RED}❌${NC} $1"
}

# Quick deployment to environment
quick_deploy() {
    local env="${1:-blue}"
    
    log "Starting quick deployment to $env environment..."
    
    # Pre-flight checks
    log "Running pre-flight checks..."
    if ! node -e "
        const flags = require('$PROJECT_ROOT/src/config/feature-flags.js');
        if (!flags.FEATURE_FLAGS.ALPHASTACK_PROTECTION) {
            console.error('AlphaStack protection disabled!');
            process.exit(1);
        }
        console.log('✅ AlphaStack protection verified');
    "; then
        error "Pre-flight checks failed"
        return 1
    fi
    
    # Run deployment
    if [ -f "$SCRIPT_DIR/blue-green-deploy.sh" ]; then
        log "Executing Blue/Green deployment..."
        bash "$SCRIPT_DIR/blue-green-deploy.sh"
    else
        error "Blue/Green deployment script not found"
        return 1
    fi
    
    success "Quick deployment completed"
}

# Emergency rollback
emergency_rollback() {
    local reason="${1:-Emergency rollback initiated}"
    
    warning "EMERGENCY ROLLBACK INITIATED"
    log "Reason: $reason"
    
    if [ -f "$SCRIPT_DIR/rollback.sh" ]; then
        bash "$SCRIPT_DIR/rollback.sh" emergency "$reason"
    else
        error "Rollback script not found"
        return 1
    fi
}

# Health check
health_check() {
    local url="${1:-http://localhost:3001}"
    
    log "Running health check on $url..."
    
    if [ -f "$SCRIPT_DIR/../health/comprehensive-health-check.js" ]; then
        DEPLOY_URL="$url" node "$SCRIPT_DIR/../health/comprehensive-health-check.js"
    else
        error "Health check script not found"
        return 1
    fi
}

# Feature flag operations
feature_flags() {
    local action="${1:-status}"
    shift
    
    if [ -f "$SCRIPT_DIR/../env/feature-flag-manager.js" ]; then
        node "$SCRIPT_DIR/../env/feature-flag-manager.js" "$action" "$@"
    else
        error "Feature flag manager not found"
        return 1
    fi
}

# Monitor deployment
monitor() {
    log "Starting deployment monitoring..."
    
    if [ -f "$SCRIPT_DIR/../monitoring/deployment-monitor.sh" ]; then
        bash "$SCRIPT_DIR/../monitoring/deployment-monitor.sh" start
    else
        error "Monitoring script not found"
        return 1
    fi
}

# Performance test
performance_test() {
    local url="${1:-http://localhost:3001}"
    
    log "Running performance test on $url..."
    
    if [ -f "$SCRIPT_DIR/../monitoring/performance-tracker.js" ]; then
        DEPLOY_URL="$url" node "$SCRIPT_DIR/../monitoring/performance-tracker.js" test
    else
        error "Performance tracker not found"
        return 1
    fi
}

# Run tests
run_tests() {
    local test_type="${1:-all}"
    
    log "Running deployment tests: $test_type"
    
    if [ -f "$SCRIPT_DIR/test-deployment.sh" ]; then
        bash "$SCRIPT_DIR/test-deployment.sh" "$test_type"
    else
        error "Test script not found"
        return 1
    fi
}

# Show system status
status() {
    echo ""
    echo "=== ALPHASTACK V3 DEPLOYMENT STATUS ==="
    echo ""
    
    # Feature flags
    echo "🏁 Feature Flags:"
    feature_flags status | grep -E "(Version|V3 Enabled|Protection)" || true
    echo ""
    
    # Health check
    echo "💚 Health Status:"
    if curl -f -s "http://localhost:3001/api/health" >/dev/null 2>&1; then
        success "API responding"
    else
        warning "API not responding"
    fi
    echo ""
    
    # AlphaStack protection
    echo "🛡️ AlphaStack Protection:"
    if node -e "
        const flags = require('$PROJECT_ROOT/src/config/feature-flags.js');
        console.log(flags.FEATURE_FLAGS.ALPHASTACK_PROTECTION ? '✅ ENABLED' : '❌ DISABLED');
    " 2>/dev/null; then
        :
    else
        error "Could not verify AlphaStack protection"
    fi
    echo ""
    
    # Git status
    echo "📦 Code Status:"
    if [ -d "$PROJECT_ROOT/.git" ]; then
        local git_status=$(cd "$PROJECT_ROOT" && git status --porcelain)
        if [ -z "$git_status" ]; then
            success "Working directory clean"
        else
            warning "Uncommitted changes detected"
        fi
    else
        warning "Not a git repository"
    fi
    echo ""
}

# Interactive menu
interactive_menu() {
    while true; do
        echo ""
        echo "=== ALPHASTACK V3 DEPLOYMENT OPERATIONS ==="
        echo ""
        echo "1) Deploy to Blue environment"
        echo "2) Deploy to Green environment"
        echo "3) Emergency Rollback"
        echo "4) Health Check"
        echo "5) System Status"
        echo "6) Feature Flags"
        echo "7) Performance Test"
        echo "8) Run Tests"
        echo "9) Monitor Deployment"
        echo "0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1)
                quick_deploy blue
                ;;
            2)
                quick_deploy green
                ;;
            3)
                read -p "Rollback reason: " reason
                emergency_rollback "$reason"
                ;;
            4)
                health_check
                ;;
            5)
                status
                ;;
            6)
                echo "Feature flag operations:"
                echo "a) Status  b) Emergency rollback  c) Enable V3"
                read -p "Select: " flag_choice
                case $flag_choice in
                    a) feature_flags status ;;
                    b) feature_flags emergency-rollback ;;
                    c) feature_flags enable-v3 ;;
                    *) warning "Invalid option" ;;
                esac
                ;;
            7)
                performance_test
                ;;
            8)
                echo "Test types: all, health, rollback, protection"
                read -p "Test type: " test_type
                run_tests "${test_type:-all}"
                ;;
            9)
                monitor
                ;;
            0)
                log "Goodbye!"
                break
                ;;
            *)
                warning "Invalid option"
                ;;
        esac
        
        echo ""
        read -p "Press Enter to continue..."
    done
}

# Main execution
main() {
    local command="${1:-menu}"
    
    case "$command" in
        "deploy")
            quick_deploy "${2:-blue}"
            ;;
        "rollback")
            emergency_rollback "${2:-Emergency rollback}"
            ;;
        "health")
            health_check "${2:-}"
            ;;
        "flags")
            shift
            feature_flags "$@"
            ;;
        "monitor")
            monitor
            ;;
        "test")
            performance_test "${2:-}"
            ;;
        "tests")
            run_tests "${2:-all}"
            ;;
        "status")
            status
            ;;
        "menu"|"interactive")
            interactive_menu
            ;;
        "--help"|"-h"|"help")
            echo "AlphaStack V3 Deployment Operations"
            echo ""
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  deploy [env]         Quick deploy to environment (blue/green)"
            echo "  rollback [reason]    Emergency rollback"
            echo "  health [url]         Health check"
            echo "  flags [action]       Feature flag operations"
            echo "  monitor              Start monitoring"
            echo "  test [url]           Performance test"
            echo "  tests [type]         Run deployment tests"
            echo "  status               Show system status"
            echo "  menu                 Interactive menu (default)"
            echo ""
            echo "Examples:"
            echo "  $0 deploy blue"
            echo "  $0 rollback \"API errors detected\""
            echo "  $0 health https://production.example.com"
            echo "  $0 flags status"
            echo "  $0 tests protection"
            echo ""
            echo "For emergency situations:"
            echo "  $0 rollback \"EMERGENCY: System down\""
            echo "  $0 flags emergency-rollback"
            ;;
        *)
            log "Unknown command: $command"
            log "Use '$0 --help' for usage information"
            interactive_menu
            ;;
    esac
}

# Execute main function
main "$@"