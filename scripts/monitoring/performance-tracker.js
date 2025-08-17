#!/usr/bin/env node
/**
 * Performance Tracking System for Blue/Green Deployments
 * Tracks performance metrics and triggers alerts
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

class PerformanceTracker {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.DEPLOY_URL || 'http://localhost:3001';
        this.projectRoot = path.resolve(__dirname, '../..');
        this.logDir = path.join(this.projectRoot, 'logs/performance');
        
        // Performance thresholds
        this.thresholds = {
            responseTime: options.responseTimeThreshold || 2000, // 2 seconds
            errorRate: options.errorRateThreshold || 5, // 5%
            memoryUsage: options.memoryThreshold || 80, // 80%
            cpuUsage: options.cpuThreshold || 85, // 85%
            throughput: options.throughputThreshold || 100 // requests per minute
        };
        
        // Tracking state
        this.metrics = {
            requests: [],
            errors: [],
            responseTime: [],
            system: [],
            alphastack: []
        };
        
        this.isTracking = false;
        this.trackingStartTime = null;
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        this.axios = axios.create({
            timeout: 10000,
            validateStatus: (status) => status < 500
        });
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const colors = {
            error: '\x1b[31m',
            warn: '\x1b[33m',
            success: '\x1b[32m',
            info: '\x1b[34m',
            reset: '\x1b[0m'
        };
        
        const color = colors[level] || colors.reset;
        const logMessage = `${color}[${timestamp}] ${message}${colors.reset}`;
        
        console.log(logMessage);
        
        // Write to log file
        const logFile = path.join(this.logDir, 'performance.log');
        fs.appendFileSync(logFile, `[${timestamp}] ${level.toUpperCase()}: ${message}\n`);
    }

    // Start performance tracking
    startTracking() {
        this.log('Starting performance tracking...', 'info');
        this.isTracking = true;
        this.trackingStartTime = Date.now();
        
        // Initialize metrics
        this.metrics = {
            requests: [],
            errors: [],
            responseTime: [],
            system: [],
            alphastack: []
        };
        
        this.log('Performance tracking started', 'success');
    }

    // Stop performance tracking
    stopTracking() {
        this.log('Stopping performance tracking...', 'info');
        this.isTracking = false;
        
        const duration = Date.now() - this.trackingStartTime;
        this.log(`Performance tracking stopped. Duration: ${Math.round(duration / 1000)}s`, 'success');
        
        return this.generateReport();
    }

    // Test API endpoint performance
    async testEndpointPerformance(endpoint, expectedStatus = 200) {
        const url = `${this.baseUrl}${endpoint}`;
        const start = performance.now();
        
        try {
            const response = await this.axios.get(url);
            const responseTime = performance.now() - start;
            
            const result = {
                endpoint,
                url,
                status: response.status,
                responseTime: Math.round(responseTime),
                timestamp: new Date().toISOString(),
                success: response.status === expectedStatus,
                size: response.headers['content-length'] || 0
            };
            
            if (this.isTracking) {
                this.metrics.requests.push(result);
                this.metrics.responseTime.push(responseTime);
                
                if (!result.success) {
                    this.metrics.errors.push(result);
                }
            }
            
            return result;
        } catch (error) {
            const responseTime = performance.now() - start;
            
            const result = {
                endpoint,
                url,
                status: 'error',
                responseTime: Math.round(responseTime),
                timestamp: new Date().toISOString(),
                success: false,
                error: error.message
            };
            
            if (this.isTracking) {
                this.metrics.requests.push(result);
                this.metrics.errors.push(result);
            }
            
            return result;
        }
    }

    // Run comprehensive performance test
    async runPerformanceTest() {
        this.log('Running comprehensive performance test...', 'info');
        
        const endpoints = [
            { path: '/api/health', expectedStatus: 200 },
            { path: '/api/alphastack/universe', expectedStatus: 200 },
            { path: '/api/discoveries?limit=10', expectedStatus: 200 },
            { path: '/api/portfolio/positions', expectedStatus: 200 },
            { path: '/', expectedStatus: 200 },
            { path: '/assets/tailwind.css', expectedStatus: 200 }
        ];
        
        const results = [];
        
        for (const endpoint of endpoints) {
            this.log(`Testing ${endpoint.path}...`);
            const result = await this.testEndpointPerformance(endpoint.path, endpoint.expectedStatus);
            results.push(result);
            
            if (result.success) {
                this.log(`✓ ${endpoint.path}: ${result.responseTime}ms`, 'success');
            } else {
                this.log(`✗ ${endpoint.path}: ${result.status} (${result.responseTime}ms)`, 'error');
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return this.analyzeResults(results);
    }

    // Load test with concurrent requests
    async runLoadTest(concurrency = 5, duration = 30000) {
        this.log(`Starting load test: ${concurrency} concurrent requests for ${duration/1000}s`, 'info');
        
        const startTime = Date.now();
        const workers = [];
        
        // Create worker promises
        for (let i = 0; i < concurrency; i++) {
            const worker = this.loadTestWorker(i, startTime + duration);
            workers.push(worker);
        }
        
        // Wait for all workers to complete
        const results = await Promise.all(workers);
        
        // Aggregate results
        const aggregated = {
            totalRequests: results.reduce((sum, r) => sum + r.requests, 0),
            totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
            averageResponseTime: results.reduce((sum, r) => sum + r.avgResponseTime, 0) / results.length,
            maxResponseTime: Math.max(...results.map(r => r.maxResponseTime)),
            minResponseTime: Math.min(...results.map(r => r.minResponseTime)),
            throughput: 0,
            duration: duration / 1000
        };
        
        aggregated.throughput = aggregated.totalRequests / (aggregated.duration / 60); // requests per minute
        aggregated.errorRate = (aggregated.totalErrors / aggregated.totalRequests) * 100;
        
        this.log(`Load test completed: ${aggregated.totalRequests} requests, ${aggregated.errorRate.toFixed(2)}% error rate`, 'info');
        
        return aggregated;
    }

    // Load test worker
    async loadTestWorker(workerId, endTime) {
        const results = {
            workerId,
            requests: 0,
            errors: 0,
            responseTimes: [],
            avgResponseTime: 0,
            maxResponseTime: 0,
            minResponseTime: Infinity
        };
        
        const endpoints = ['/api/health', '/api/alphastack/universe', '/api/discoveries?limit=5'];
        
        while (Date.now() < endTime) {
            const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
            const result = await this.testEndpointPerformance(endpoint);
            
            results.requests++;
            results.responseTimes.push(result.responseTime);
            
            if (!result.success) {
                results.errors++;
            }
            
            if (result.responseTime > results.maxResponseTime) {
                results.maxResponseTime = result.responseTime;
            }
            
            if (result.responseTime < results.minResponseTime) {
                results.minResponseTime = result.responseTime;
            }
            
            // Small delay to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        results.avgResponseTime = results.responseTimes.reduce((sum, time) => sum + time, 0) / results.responseTimes.length;
        
        return results;
    }

    // Test AlphaStack specific functionality
    async testAlphaStackPerformance() {
        this.log('Testing AlphaStack performance...', 'info');
        
        const alphaStackTests = [
            {
                name: 'Universe Load',
                test: () => this.testEndpointPerformance('/api/alphastack/universe')
            },
            {
                name: 'Discovery Search',
                test: () => this.testEndpointPerformance('/api/discoveries?limit=20')
            },
            {
                name: 'Stock Scoring',
                test: () => this.testEndpointPerformance('/api/alphastack/score/AAPL')
            },
            {
                name: 'Portfolio Analysis',
                test: () => this.testEndpointPerformance('/api/portfolio/positions')
            },
            {
                name: 'Scan Status',
                test: () => this.testEndpointPerformance('/api/v2/scan')
            }
        ];
        
        const results = [];
        
        for (const test of alphaStackTests) {
            this.log(`Running ${test.name} test...`);
            const result = await test.test();
            result.testName = test.name;
            results.push(result);
            
            if (this.isTracking) {
                this.metrics.alphastack.push(result);
            }
            
            if (result.success) {
                this.log(`✓ ${test.name}: ${result.responseTime}ms`, 'success');
            } else {
                this.log(`✗ ${test.name}: ${result.status}`, 'error');
            }
        }
        
        return results;
    }

    // Analyze performance results
    analyzeResults(results) {
        const analysis = {
            summary: {
                totalRequests: results.length,
                successfulRequests: results.filter(r => r.success).length,
                failedRequests: results.filter(r => !r.success).length,
                errorRate: 0,
                averageResponseTime: 0,
                maxResponseTime: 0,
                minResponseTime: Infinity
            },
            alerts: [],
            recommendations: []
        };
        
        // Calculate metrics
        const responseTimes = results.filter(r => r.success).map(r => r.responseTime);
        
        if (responseTimes.length > 0) {
            analysis.summary.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
            analysis.summary.maxResponseTime = Math.max(...responseTimes);
            analysis.summary.minResponseTime = Math.min(...responseTimes);
        }
        
        analysis.summary.errorRate = (analysis.summary.failedRequests / analysis.summary.totalRequests) * 100;
        
        // Generate alerts
        if (analysis.summary.errorRate > this.thresholds.errorRate) {
            analysis.alerts.push({
                type: 'HIGH_ERROR_RATE',
                message: `Error rate ${analysis.summary.errorRate.toFixed(2)}% exceeds threshold ${this.thresholds.errorRate}%`,
                severity: 'critical'
            });
        }
        
        if (analysis.summary.averageResponseTime > this.thresholds.responseTime) {
            analysis.alerts.push({
                type: 'SLOW_RESPONSE_TIME',
                message: `Average response time ${analysis.summary.averageResponseTime.toFixed(0)}ms exceeds threshold ${this.thresholds.responseTime}ms`,
                severity: 'warning'
            });
        }
        
        // Generate recommendations
        if (analysis.summary.averageResponseTime > 1000) {
            analysis.recommendations.push('Consider enabling API caching to improve response times');
        }
        
        if (analysis.summary.errorRate > 0) {
            analysis.recommendations.push('Investigate error causes and improve error handling');
        }
        
        if (analysis.summary.maxResponseTime > 5000) {
            analysis.recommendations.push('Some endpoints are very slow - consider optimization');
        }
        
        return analysis;
    }

    // Get system metrics
    async getSystemMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            uptime: process.uptime()
        };
        
        // Calculate memory usage percentage
        const totalMemory = require('os').totalmem();
        const freeMemory = require('os').freemem();
        metrics.memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;
        
        if (this.isTracking) {
            this.metrics.system.push(metrics);
        }
        
        return metrics;
    }

    // Generate comprehensive report
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            trackingDuration: this.trackingStartTime ? Date.now() - this.trackingStartTime : 0,
            thresholds: this.thresholds,
            summary: {
                totalRequests: this.metrics.requests.length,
                totalErrors: this.metrics.errors.length,
                errorRate: this.metrics.errors.length / (this.metrics.requests.length || 1) * 100,
                averageResponseTime: this.metrics.responseTime.length > 0 ? 
                    this.metrics.responseTime.reduce((sum, time) => sum + time, 0) / this.metrics.responseTime.length : 0
            },
            detailed: {
                requests: this.metrics.requests,
                errors: this.metrics.errors,
                alphastack: this.metrics.alphastack,
                system: this.metrics.system
            },
            analysis: null
        };
        
        // Analyze overall performance
        if (this.metrics.requests.length > 0) {
            report.analysis = this.analyzeResults(this.metrics.requests);
        }
        
        // Save report
        const reportPath = path.join(this.logDir, `performance-report-${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        this.log(`Performance report saved: ${reportPath}`, 'success');
        
        return report;
    }

    // Print report summary
    printSummary(report) {
        console.log('\n=== PERFORMANCE REPORT SUMMARY ===');
        console.log(`Timestamp: ${report.timestamp}`);
        console.log(`Tracking Duration: ${Math.round(report.trackingDuration / 1000)}s`);
        console.log(`Total Requests: ${report.summary.totalRequests}`);
        console.log(`Total Errors: ${report.summary.totalErrors}`);
        console.log(`Error Rate: ${report.summary.errorRate.toFixed(2)}%`);
        console.log(`Average Response Time: ${Math.round(report.summary.averageResponseTime)}ms`);
        
        if (report.analysis) {
            console.log('\n=== ALERTS ===');
            if (report.analysis.alerts.length === 0) {
                console.log('✓ No performance alerts');
            } else {
                report.analysis.alerts.forEach(alert => {
                    const icon = alert.severity === 'critical' ? '🚨' : '⚠️';
                    console.log(`${icon} ${alert.type}: ${alert.message}`);
                });
            }
            
            console.log('\n=== RECOMMENDATIONS ===');
            if (report.analysis.recommendations.length === 0) {
                console.log('✓ No recommendations');
            } else {
                report.analysis.recommendations.forEach((rec, index) => {
                    console.log(`${index + 1}. ${rec}`);
                });
            }
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const baseUrl = process.env.DEPLOY_URL || 'http://localhost:3001';
    const tracker = new PerformanceTracker({ baseUrl });
    
    try {
        switch (command) {
            case 'test':
                const testResult = await tracker.runPerformanceTest();
                tracker.printSummary({ 
                    timestamp: new Date().toISOString(),
                    trackingDuration: 0,
                    summary: testResult.summary,
                    analysis: testResult
                });
                
                if (testResult.alerts.length > 0) {
                    process.exit(1);
                }
                break;
                
            case 'alphastack':
                await tracker.testAlphaStackPerformance();
                break;
                
            case 'load':
                const concurrency = parseInt(args[1]) || 5;
                const duration = parseInt(args[2]) || 30000;
                const loadResult = await tracker.runLoadTest(concurrency, duration);
                console.log('Load Test Results:', loadResult);
                break;
                
            case 'track':
                const trackDuration = parseInt(args[1]) || 60000; // 1 minute default
                tracker.startTracking();
                
                console.log(`Tracking performance for ${trackDuration/1000} seconds...`);
                
                // Run tests during tracking
                const interval = setInterval(async () => {
                    await tracker.runPerformanceTest();
                }, 5000);
                
                setTimeout(() => {
                    clearInterval(interval);
                    const report = tracker.stopTracking();
                    tracker.printSummary(report);
                    
                    if (report.analysis && report.analysis.alerts.length > 0) {
                        process.exit(1);
                    }
                }, trackDuration);
                break;
                
            case 'system':
                const systemMetrics = await tracker.getSystemMetrics();
                console.log('System Metrics:', JSON.stringify(systemMetrics, null, 2));
                break;
                
            default:
                console.log('Performance Tracker for AlphaStack V3');
                console.log('');
                console.log('Commands:');
                console.log('  test                 Run performance test');
                console.log('  alphastack           Test AlphaStack specific endpoints');
                console.log('  load [conc] [dur]    Run load test (concurrency, duration in ms)');
                console.log('  track [duration]     Track performance for duration (ms)');
                console.log('  system               Show system metrics');
                console.log('');
                console.log('Environment:');
                console.log('  DEPLOY_URL           Base URL for testing (default: http://localhost:3001)');
                console.log('');
                console.log('Examples:');
                console.log('  node performance-tracker.js test');
                console.log('  node performance-tracker.js load 10 60000');
                console.log('  node performance-tracker.js track 120000');
                break;
        }
    } catch (error) {
        console.error(`Performance tracking failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = PerformanceTracker;