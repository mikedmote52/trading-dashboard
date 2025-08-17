#!/bin/bash
# Deployment Monitoring System for AlphaStack V3
# Real-time monitoring with automatic rollback triggers

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HEALTH_SCRIPT="$SCRIPT_DIR/../health/comprehensive-health-check.js"
ROLLBACK_SCRIPT="$SCRIPT_DIR/../deploy/rollback.sh"
LOG_DIR="$PROJECT_ROOT/logs/monitoring"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Monitoring configuration
MONITOR_INTERVAL="${MONITOR_INTERVAL:-10}"  # seconds
ALERT_THRESHOLD_ERROR_RATE="${ALERT_THRESHOLD_ERROR_RATE:-5}"  # percentage
ALERT_THRESHOLD_RESPONSE_TIME="${ALERT_THRESHOLD_RESPONSE_TIME:-3000}"  # milliseconds
ALERT_THRESHOLD_MEMORY="${ALERT_THRESHOLD_MEMORY:-80}"  # percentage
ROLLBACK_THRESHOLD_ERRORS="${ROLLBACK_THRESHOLD_ERRORS:-10}"  # consecutive errors
ROLLBACK_THRESHOLD_RESPONSE_TIME="${ROLLBACK_THRESHOLD_RESPONSE_TIME:-5000}"  # milliseconds

# State tracking
CONSECUTIVE_ERRORS=0
CONSECUTIVE_SLOW_RESPONSES=0
MONITORING_ACTIVE=false
DEPLOYMENT_START_TIME=""
BASELINE_METRICS=""

# Logging
log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp]${NC} $1" | tee -a "$LOG_DIR/monitor.log"
}

success() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp] SUCCESS:${NC} $1" | tee -a "$LOG_DIR/monitor.log"
}

warning() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[$timestamp] WARNING:${NC} $1" | tee -a "$LOG_DIR/monitor.log"
}

error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[$timestamp] ERROR:${NC} $1" | tee -a "$LOG_DIR/monitor.log"
}

alert() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${MAGENTA}[$timestamp] ALERT:${NC} $1" | tee -a "$LOG_DIR/monitor.log" "$LOG_DIR/alerts.log"
}

# Initialize monitoring
initialize_monitoring() {
    log "Initializing deployment monitoring system..."
    
    # Create log directories
    mkdir -p "$LOG_DIR"
    
    # Initialize log files
    echo "=== Deployment Monitoring Started: $(date) ===" >> "$LOG_DIR/monitor.log"
    echo "=== Alert Log Started: $(date) ===" >> "$LOG_DIR/alerts.log"
    
    # Get baseline metrics
    if command -v node >/dev/null 2>&1; then
        BASELINE_METRICS=$(get_current_metrics)
        log "Baseline metrics captured"
    else
        warning "Node.js not available for metrics collection"
    fi
    
    DEPLOYMENT_START_TIME=$(date +%s)
    MONITORING_ACTIVE=true
    
    success "Monitoring system initialized"
}

# Get current system metrics
get_current_metrics() {
    local base_url="${DEPLOY_URL:-http://localhost:3001}"
    
    # Collect comprehensive metrics
    node -e "
        const axios = require('axios');
        const os = require('os');
        
        async function collectMetrics() {
            const metrics = {
                timestamp: new Date().toISOString(),
                system: {
                    memory: {
                        total: os.totalmem(),
                        free: os.freemem(),
                        used_percent: Math.round((1 - os.freemem() / os.totalmem()) * 100)
                    },
                    cpu: os.loadavg(),
                    uptime: os.uptime()
                },
                application: {
                    health: null,
                    response_times: {},
                    error_rate: 0
                }
            };
            
            // Test application health
            try {
                const start = Date.now();
                const response = await axios.get('${base_url}/api/health', { timeout: 5000 });
                const responseTime = Date.now() - start;
                
                metrics.application.health = response.data;
                metrics.application.response_times.health = responseTime;
                
                // Test other endpoints
                const endpoints = [
                    '/api/alphastack/universe',
                    '/api/discoveries?limit=5'
                ];
                
                for (const endpoint of endpoints) {
                    try {
                        const endpointStart = Date.now();
                        const endpointResponse = await axios.get('${base_url}' + endpoint, { timeout: 5000 });
                        const endpointTime = Date.now() - endpointStart;
                        
                        metrics.application.response_times[endpoint.replace('/api/', '')] = endpointTime;
                    } catch (error) {
                        metrics.application.response_times[endpoint.replace('/api/', '')] = 'error';
                        metrics.application.error_rate += 1;
                    }
                }
                
                // Calculate error rate
                const totalTests = endpoints.length + 1;
                metrics.application.error_rate = Math.round((metrics.application.error_rate / totalTests) * 100);
                
            } catch (error) {
                metrics.application.health = 'unreachable';
                metrics.application.error_rate = 100;
            }
            
            console.log(JSON.stringify(metrics, null, 2));
        }
        
        collectMetrics().catch(error => {
            console.error(JSON.stringify({ error: error.message }));
            process.exit(1);
        });
    " 2>/dev/null || echo '{"error": "metrics collection failed"}'
}

# Analyze metrics for alerts
analyze_metrics() {
    local metrics="$1"
    local alerts=()
    
    # Parse metrics JSON
    local memory_percent=$(echo "$metrics" | node -e "
        const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
        console.log(data.system?.memory?.used_percent || 0);
    " 2>/dev/null || echo "0")
    
    local error_rate=$(echo "$metrics" | node -e "
        const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
        console.log(data.application?.error_rate || 0);
    " 2>/dev/null || echo "0")
    
    local health_response_time=$(echo "$metrics" | node -e "
        const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
        console.log(data.application?.response_times?.health || 0);
    " 2>/dev/null || echo "0")
    
    # Check thresholds
    if [ "${memory_percent%.*}" -gt "$ALERT_THRESHOLD_MEMORY" ]; then
        alerts+=("HIGH_MEMORY: ${memory_percent}% (threshold: ${ALERT_THRESHOLD_MEMORY}%)")
    fi
    
    if [ "${error_rate%.*}" -gt "$ALERT_THRESHOLD_ERROR_RATE" ]; then
        alerts+=("HIGH_ERROR_RATE: ${error_rate}% (threshold: ${ALERT_THRESHOLD_ERROR_RATE}%)")
        ((CONSECUTIVE_ERRORS++))
    else
        CONSECUTIVE_ERRORS=0
    fi
    
    if [ "${health_response_time%.*}" -gt "$ALERT_THRESHOLD_RESPONSE_TIME" ]; then
        alerts+=("SLOW_RESPONSE: ${health_response_time}ms (threshold: ${ALERT_THRESHOLD_RESPONSE_TIME}ms)")
        ((CONSECUTIVE_SLOW_RESPONSES++))
    else
        CONSECUTIVE_SLOW_RESPONSES=0
    fi
    
    # Check for rollback conditions
    local should_rollback=false
    local rollback_reason=""
    
    if [ "$CONSECUTIVE_ERRORS" -ge "$ROLLBACK_THRESHOLD_ERRORS" ]; then
        should_rollback=true
        rollback_reason="Consecutive errors: $CONSECUTIVE_ERRORS (threshold: $ROLLBACK_THRESHOLD_ERRORS)"
    elif [ "${health_response_time%.*}" -gt "$ROLLBACK_THRESHOLD_RESPONSE_TIME" ]; then
        should_rollback=true
        rollback_reason="Response time too slow: ${health_response_time}ms (threshold: ${ROLLBACK_THRESHOLD_RESPONSE_TIME}ms)"
    elif [ "${error_rate%.*}" -gt "50" ]; then
        should_rollback=true
        rollback_reason="Critical error rate: ${error_rate}%"
    fi
    
    # Process alerts
    for alert_msg in "${alerts[@]}"; do
        alert "$alert_msg"
    done
    
    # Trigger rollback if necessary
    if [ "$should_rollback" = true ]; then
        trigger_automatic_rollback "$rollback_reason"
        return 1
    fi
    
    return 0
}

# Check AlphaStack protection
check_alphastack_protection() {
    log "Checking AlphaStack protection status..."
    
    if node -e "
        const flags = require('$PROJECT_ROOT/src/config/feature-flags.js');
        const config = flags.getConfig();
        
        if (!config.protection.alphastack_immutable) {
            console.error('AlphaStack protection is disabled!');
            process.exit(1);
        }
        
        console.log('AlphaStack protection verified');
    " 2>/dev/null; then
        log "✓ AlphaStack protection verified"
        return 0
    else
        alert "CRITICAL: AlphaStack protection is disabled!"
        trigger_automatic_rollback "AlphaStack protection disabled"
        return 1
    fi
}

# Trigger automatic rollback
trigger_automatic_rollback() {
    local reason="$1"
    
    alert "TRIGGERING AUTOMATIC ROLLBACK: $reason"
    
    # Stop monitoring to prevent rollback loops
    MONITORING_ACTIVE=false
    
    # Execute emergency rollback
    if [ -f "$ROLLBACK_SCRIPT" ]; then
        log "Executing emergency rollback script..."
        if bash "$ROLLBACK_SCRIPT" emergency "$reason"; then
            success "Automatic rollback completed successfully"
            
            # Re-enable monitoring in read-only mode
            sleep 10
            monitor_post_rollback
        else
            error "Automatic rollback failed - manual intervention required"
            send_critical_alert "Automatic rollback failed: $reason"
        fi
    else
        error "Rollback script not found: $ROLLBACK_SCRIPT"
        send_critical_alert "Cannot execute rollback - script missing"
    fi
}

# Monitor post-rollback status
monitor_post_rollback() {
    log "Monitoring post-rollback status..."
    
    local validation_attempts=5
    local attempt=1
    
    while [ $attempt -le $validation_attempts ]; do
        log "Post-rollback validation attempt $attempt/$validation_attempts"
        
        # Run health check
        if node "$HEALTH_SCRIPT" --timeout=10 2>/dev/null; then
            success "Post-rollback validation passed"
            
            # Log rollback metrics
            local post_rollback_metrics=$(get_current_metrics)
            echo "$post_rollback_metrics" > "$LOG_DIR/post-rollback-metrics.json"
            
            return 0
        fi
        
        warning "Post-rollback validation failed, attempt $attempt/$validation_attempts"
        sleep 5
        ((attempt++))
    done
    
    error "Post-rollback validation failed after $validation_attempts attempts"
    send_critical_alert "Post-rollback validation failed - system may be unstable"
    return 1
}

# Send critical alert (placeholder for integration with alerting systems)
send_critical_alert() {
    local message="$1"
    
    alert "CRITICAL ALERT: $message"
    
    # Log critical alert
    echo "$(date -u +%Y%m%d_%H%M%S): $message" >> "$LOG_DIR/critical-alerts.log"
    
    # In production, this would integrate with:
    # - Slack/Discord webhooks
    # - PagerDuty
    # - Email notifications
    # - SMS alerts
    
    # Placeholder implementation
    if command -v curl >/dev/null 2>&1 && [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 AlphaStack Critical Alert: $message\"}" \
            "$SLACK_WEBHOOK_URL" 2>/dev/null || true
    fi
}

# Main monitoring loop
monitor_deployment() {
    log "Starting deployment monitoring loop..."
    log "Monitor interval: ${MONITOR_INTERVAL}s"
    log "Error threshold: ${ALERT_THRESHOLD_ERROR_RATE}%"
    log "Response time threshold: ${ALERT_THRESHOLD_RESPONSE_TIME}ms"
    log "Memory threshold: ${ALERT_THRESHOLD_MEMORY}%"
    
    while [ "$MONITORING_ACTIVE" = true ]; do
        local cycle_start=$(date +%s)
        
        # Check AlphaStack protection first
        if ! check_alphastack_protection; then
            break
        fi
        
        # Get current metrics
        local current_metrics=$(get_current_metrics)
        
        if [ -n "$current_metrics" ] && [ "$current_metrics" != '{"error": "metrics collection failed"}' ]; then
            # Save metrics
            echo "$current_metrics" > "$LOG_DIR/current-metrics.json"
            
            # Analyze for alerts
            if ! analyze_metrics "$current_metrics"; then
                # Rollback was triggered
                break
            fi
            
            # Log status summary
            local error_rate=$(echo "$current_metrics" | node -e "
                const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                console.log(data.application?.error_rate || 0);
            " 2>/dev/null || echo "0")
            
            local memory_percent=$(echo "$current_metrics" | node -e "
                const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                console.log(data.system?.memory?.used_percent || 0);
            " 2>/dev/null || echo "0")
            
            log "Status: Error rate: ${error_rate}%, Memory: ${memory_percent}%, Consecutive errors: $CONSECUTIVE_ERRORS"
        else
            warning "Failed to collect metrics"
            ((CONSECUTIVE_ERRORS++))
            
            if [ "$CONSECUTIVE_ERRORS" -ge 3 ]; then
                trigger_automatic_rollback "Metrics collection failed $CONSECUTIVE_ERRORS times"
                break
            fi
        fi
        
        # Calculate sleep time to maintain interval
        local cycle_end=$(date +%s)
        local cycle_duration=$((cycle_end - cycle_start))
        local sleep_time=$((MONITOR_INTERVAL - cycle_duration))
        
        if [ $sleep_time -gt 0 ]; then
            sleep $sleep_time
        fi
    done
    
    log "Monitoring loop ended"
}

# Generate monitoring report
generate_report() {
    local report_file="$LOG_DIR/deployment-report-$(date +%Y%m%d_%H%M%S).json"
    
    log "Generating deployment monitoring report..."
    
    # Collect report data
    node -e "
        const fs = require('fs');
        const path = require('path');
        
        const report = {
            deployment: {
                start_time: '${DEPLOYMENT_START_TIME}',
                end_time: Math.floor(Date.now() / 1000),
                duration_seconds: Math.floor(Date.now() / 1000) - ${DEPLOYMENT_START_TIME:-0}
            },
            monitoring: {
                interval: ${MONITOR_INTERVAL},
                consecutive_errors: ${CONSECUTIVE_ERRORS},
                consecutive_slow_responses: ${CONSECUTIVE_SLOW_RESPONSES}
            },
            thresholds: {
                error_rate: ${ALERT_THRESHOLD_ERROR_RATE},
                response_time: ${ALERT_THRESHOLD_RESPONSE_TIME},
                memory: ${ALERT_THRESHOLD_MEMORY},
                rollback_errors: ${ROLLBACK_THRESHOLD_ERRORS},
                rollback_response_time: ${ROLLBACK_THRESHOLD_RESPONSE_TIME}
            },
            logs: {
                monitor_log: '${LOG_DIR}/monitor.log',
                alerts_log: '${LOG_DIR}/alerts.log',
                critical_alerts_log: '${LOG_DIR}/critical-alerts.log'
            }
        };
        
        // Add latest metrics if available
        try {
            const metricsPath = '${LOG_DIR}/current-metrics.json';
            if (fs.existsSync(metricsPath)) {
                report.final_metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
            }
        } catch (error) {
            report.metrics_error = error.message;
        }
        
        // Add baseline metrics if available
        try {
            if ('${BASELINE_METRICS}') {
                report.baseline_metrics = JSON.parse('${BASELINE_METRICS}');
            }
        } catch (error) {
            report.baseline_error = error.message;
        }
        
        fs.writeFileSync('${report_file}', JSON.stringify(report, null, 2));
        console.log('Report generated: ${report_file}');
    " || {
        error "Failed to generate monitoring report"
    }
    
    log "Monitoring report saved: $report_file"
}

# Cleanup monitoring
cleanup_monitoring() {
    log "Cleaning up monitoring system..."
    
    MONITORING_ACTIVE=false
    
    # Generate final report
    generate_report
    
    # Cleanup old log files (keep last 30 days)
    find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
    find "$LOG_DIR" -name "*.json" -mtime +30 -delete 2>/dev/null || true
    
    success "Monitoring cleanup completed"
}

# Signal handlers
trap 'cleanup_monitoring; exit 0' SIGTERM SIGINT

# Main execution
main() {
    local command="${1:-monitor}"
    
    case "$command" in
        "--start"|"start")
            initialize_monitoring
            monitor_deployment
            ;;
        "--stop"|"stop")
            MONITORING_ACTIVE=false
            log "Monitoring stop requested"
            ;;
        "--status"|"status")
            if [ -f "$LOG_DIR/current-metrics.json" ]; then
                echo "Latest metrics:"
                cat "$LOG_DIR/current-metrics.json" | node -e "
                    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                    console.log('Error Rate:', data.application?.error_rate || 'N/A', '%');
                    console.log('Memory Usage:', data.system?.memory?.used_percent || 'N/A', '%');
                    console.log('Health Response Time:', data.application?.response_times?.health || 'N/A', 'ms');
                "
            else
                echo "No current metrics available"
            fi
            ;;
        "--report"|"report")
            generate_report
            ;;
        "--test"|"test")
            log "Testing monitoring system..."
            local test_metrics=$(get_current_metrics)
            echo "Test metrics collected:"
            echo "$test_metrics"
            ;;
        *)
            echo "Deployment Monitoring System"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  start, --start    Start monitoring"
            echo "  stop, --stop      Stop monitoring"
            echo "  status, --status  Show current status"
            echo "  report, --report  Generate report"
            echo "  test, --test      Test metrics collection"
            echo ""
            echo "Environment Variables:"
            echo "  MONITOR_INTERVAL            Monitor interval in seconds (default: 10)"
            echo "  ALERT_THRESHOLD_ERROR_RATE  Error rate threshold % (default: 5)"
            echo "  ALERT_THRESHOLD_RESPONSE_TIME Response time threshold ms (default: 3000)"
            echo "  ALERT_THRESHOLD_MEMORY      Memory usage threshold % (default: 80)"
            echo "  ROLLBACK_THRESHOLD_ERRORS   Consecutive errors for rollback (default: 10)"
            echo "  SLACK_WEBHOOK_URL           Slack webhook for alerts"
            ;;
    esac
}

# Execute main function
main "$@"