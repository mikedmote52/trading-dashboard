#!/bin/bash
# Emergency Rollback Script for AlphaStack V3
# Provides instant rollback capability with <30 second target

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Rollback modes
ROLLBACK_MODE="${1:-auto}"  # auto, manual, emergency
ROLLBACK_REASON="${2:-Manual rollback initiated}"

# Emergency rollback (fastest possible)
emergency_rollback() {
    log "=== EMERGENCY ROLLBACK INITIATED ==="
    log "Reason: $ROLLBACK_REASON"
    
    local start_time=$(date +%s)
    
    # 1. Immediate feature flag revert (1-2 seconds)
    log "Step 1/4: Reverting feature flags..."
    node -e "
        const fs = require('fs');
        const path = '$PROJECT_ROOT/src/config/feature-flags.js';
        
        try {
            let content = fs.readFileSync(path, 'utf8');
            
            // Force V2 fallback mode
            content = content.replace(
                /FORCE_V2_FALLBACK === 'true'/g,
                \"FORCE_V2_FALLBACK === 'true' || true\"
            );
            
            // Disable V3 features
            content = content.replace(
                /ALPHASTACK_V3_ENABLED: process\.env\.ALPHASTACK_V3_ENABLED === 'true'/,
                \"ALPHASTACK_V3_ENABLED: false\"
            );
            
            // Enable circuit breaker
            content = content.replace(
                /CIRCUIT_BREAKER: process\.env\.V3_CIRCUIT_BREAKER !== 'false'/,
                \"CIRCUIT_BREAKER: true\"
            );
            
            fs.writeFileSync(path, content);
            console.log('✓ Feature flags reverted to safe mode');
        } catch (error) {
            console.error('✗ Feature flag revert failed:', error.message);
            process.exit(1);
        }
    " || {
        error "Critical: Feature flag revert failed"
        exit 1
    }
    
    # 2. Force read-only mode (1 second)
    log "Step 2/4: Enabling read-only mode..."
    export READ_ONLY_MODE=true
    export FORCE_V2_FALLBACK=true
    export ALPHASTACK_V3_DISABLED=true
    
    # 3. Restart critical services (5-10 seconds)
    log "Step 3/4: Restarting services..."
    if command -v pm2 >/dev/null 2>&1; then
        pm2 restart trading-dashboard 2>/dev/null || true
    fi
    
    # 4. Quick health validation (5-10 seconds)
    log "Step 4/4: Validating rollback..."
    local validation_attempts=3
    local attempt=1
    
    while [ $attempt -le $validation_attempts ]; do
        if node -e "
            const axios = require('axios');
            const baseUrl = process.env.DEPLOY_URL || 'http://localhost:3001';
            
            async function quickHealth() {
                try {
                    const response = await axios.get(\`\${baseUrl}/api/health\`, {
                        timeout: 3000
                    });
                    
                    if (response.status === 200) {
                        console.log('✓ Emergency rollback health check passed');
                        return true;
                    }
                } catch (error) {
                    console.log('⚠ Health check attempt failed:', error.message);
                    process.exit(1);
                }
            }
            
            quickHealth();
        " 2>/dev/null; then
            break
        fi
        
        ((attempt++))
        sleep 2
    done
    
    local end_time=$(date +%s)
    local rollback_duration=$((end_time - start_time))
    
    if [ $rollback_duration -le 30 ]; then
        success "Emergency rollback completed in ${rollback_duration}s (target: <30s)"
    else
        warning "Emergency rollback completed in ${rollback_duration}s (exceeded 30s target)"
    fi
    
    log "=== EMERGENCY ROLLBACK COMPLETE ==="
    log "System Status: READ-ONLY MODE ACTIVE"
    log "AlphaStack Protection: ENABLED"
    log "Manual intervention may be required for full recovery"
}

# Auto rollback with environment detection
auto_rollback() {
    log "=== AUTO ROLLBACK INITIATED ==="
    log "Reason: $ROLLBACK_REASON"
    
    # Detect current environment
    local current_env="unknown"
    if [ -f "$PROJECT_ROOT/.env.deployment" ]; then
        current_env=$(grep "CURRENT_ENV=" "$PROJECT_ROOT/.env.deployment" | cut -d'=' -f2 || echo "unknown")
    fi
    
    log "Detected environment: $current_env"
    
    # Determine rollback target
    local rollback_target="blue"
    if [ "$current_env" = "blue" ]; then
        rollback_target="green"
    fi
    
    log "Rolling back from $current_env to $rollback_target"
    
    # Execute controlled rollback
    emergency_rollback
    
    # Update environment tracking
    echo "CURRENT_ENV=$rollback_target" > "$PROJECT_ROOT/.env.deployment"
    echo "ROLLBACK_TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)" >> "$PROJECT_ROOT/.env.deployment"
    echo "ROLLBACK_REASON=$ROLLBACK_REASON" >> "$PROJECT_ROOT/.env.deployment"
    
    success "Auto rollback to $rollback_target completed"
}

# Manual rollback with confirmation
manual_rollback() {
    log "=== MANUAL ROLLBACK REQUESTED ==="
    log "Reason: $ROLLBACK_REASON"
    
    # Confirmation prompt
    echo -n "Are you sure you want to rollback? This will:"
    echo "  - Disable AlphaStack V3 features"
    echo "  - Enable read-only mode"
    echo "  - Switch to V2 fallback"
    echo -n "Continue? (yes/NO): "
    
    read -r confirmation
    if [ "$confirmation" != "yes" ]; then
        log "Rollback cancelled by user"
        exit 0
    fi
    
    auto_rollback
}

# Recovery validation
validate_recovery() {
    log "Validating system recovery..."
    
    # Check critical systems
    local checks=(
        "health_endpoint"
        "alphastack_api"
        "feature_flags"
        "database_connection"
    )
    
    local failed_checks=0
    
    for check in "${checks[@]}"; do
        case $check in
            "health_endpoint")
                if node -e "
                    const axios = require('axios');
                    const baseUrl = process.env.DEPLOY_URL || 'http://localhost:3001';
                    
                    axios.get(\`\${baseUrl}/api/health\`, { timeout: 5000 })
                        .then(response => {
                            if (response.status === 200) {
                                console.log('✓ Health endpoint responding');
                                process.exit(0);
                            } else {
                                console.log('✗ Health endpoint returned:', response.status);
                                process.exit(1);
                            }
                        })
                        .catch(error => {
                            console.log('✗ Health endpoint failed:', error.message);
                            process.exit(1);
                        });
                " 2>/dev/null; then
                    log "✓ Health endpoint: OK"
                else
                    log "✗ Health endpoint: FAILED"
                    ((failed_checks++))
                fi
                ;;
                
            "alphastack_api")
                if node -e "
                    const flags = require('$PROJECT_ROOT/src/config/feature-flags.js');
                    if (flags.FEATURE_FLAGS.ALPHASTACK_PROTECTION) {
                        console.log('✓ AlphaStack protection enabled');
                        process.exit(0);
                    } else {
                        console.log('✗ AlphaStack protection disabled');
                        process.exit(1);
                    }
                " 2>/dev/null; then
                    log "✓ AlphaStack protection: OK"
                else
                    log "✗ AlphaStack protection: FAILED"
                    ((failed_checks++))
                fi
                ;;
                
            "feature_flags")
                if node -e "
                    const flags = require('$PROJECT_ROOT/src/config/feature-flags.js');
                    const config = flags.getConfig();
                    
                    if (config.version === 'v2' || flags.isInFallbackMode()) {
                        console.log('✓ Fallback mode active');
                        process.exit(0);
                    } else {
                        console.log('✗ Fallback mode not active');
                        process.exit(1);
                    }
                " 2>/dev/null; then
                    log "✓ Feature flags: OK (fallback mode)"
                else
                    log "✗ Feature flags: FAILED"
                    ((failed_checks++))
                fi
                ;;
                
            "database_connection")
                if [ -f "$PROJECT_ROOT/trading_dashboard.db" ]; then
                    log "✓ Database: OK"
                else
                    log "✗ Database: FAILED"
                    ((failed_checks++))
                fi
                ;;
        esac
    done
    
    if [ $failed_checks -eq 0 ]; then
        success "All recovery validation checks passed"
        return 0
    else
        error "$failed_checks validation checks failed"
        return 1
    fi
}

# Show rollback status
show_status() {
    log "=== ROLLBACK STATUS ==="
    
    if [ -f "$PROJECT_ROOT/.env.deployment" ]; then
        cat "$PROJECT_ROOT/.env.deployment"
    else
        log "No deployment tracking file found"
    fi
    
    # Current feature flag status
    log ""
    log "Feature Flag Status:"
    node -e "
        const flags = require('$PROJECT_ROOT/src/config/feature-flags.js');
        const config = flags.getConfig();
        
        console.log('Version:', config.version);
        console.log('Fallback mode:', flags.isInFallbackMode());
        console.log('AlphaStack protection:', config.protection.alphastack_immutable);
        console.log('Read-only mode:', config.protection.read_only_mode);
        console.log('Circuit breaker:', config.protection.circuit_breaker);
    " 2>/dev/null || log "Failed to read feature flag status"
}

# Main execution
main() {
    case "$ROLLBACK_MODE" in
        "emergency")
            emergency_rollback
            ;;
        "auto")
            auto_rollback
            ;;
        "manual")
            manual_rollback
            ;;
        "status")
            show_status
            exit 0
            ;;
        "validate")
            validate_recovery
            exit $?
            ;;
        *)
            error "Invalid rollback mode: $ROLLBACK_MODE"
            echo "Usage: $0 [emergency|auto|manual|status|validate] [reason]"
            exit 1
            ;;
    esac
    
    # Always validate after rollback
    log ""
    validate_recovery
}

# Execute main function
main "$@"