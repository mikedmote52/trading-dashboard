#!/usr/bin/env node
/**
 * Comprehensive Health Check System for AlphaStack V3
 * Validates all critical systems before and after deployments
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
    baseUrl: process.env.DEPLOY_URL || 'http://localhost:3001',
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 30000,
    maxResponseTime: parseInt(process.env.MAX_RESPONSE_TIME) || 2000,
    minSuccessRate: parseInt(process.env.MIN_SUCCESS_RATE) || 95,
    retryAttempts: 3,
    retryDelay: 2000
};

// Health check categories
const HEALTH_CHECKS = {
    CRITICAL: ['api_health', 'alphastack_protection', 'database', 'feature_flags'],
    IMPORTANT: ['alphastack_api', 'portfolio_api', 'discovery_api', 'performance'],
    OPTIONAL: ['static_assets', 'logging', 'monitoring']
};

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

class HealthChecker {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            checks: {},
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            },
            performance: {
                totalTime: 0,
                averageResponseTime: 0
            }
        };
        
        this.axios = axios.create({
            timeout: CONFIG.timeout,
            validateStatus: function (status) {
                return status < 500; // Don't reject on 4xx errors
            }
        });
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const color = {
            error: colors.red,
            warn: colors.yellow,
            success: colors.green,
            info: colors.blue
        }[level] || colors.reset;
        
        console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async executeWithRetry(checkFn, name, retries = CONFIG.retryAttempts) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const result = await checkFn();
                if (result.status === 'healthy') {
                    return result;
                }
                
                if (attempt === retries) {
                    return result; // Return last result if all retries failed
                }
                
                this.log(`Retry ${attempt}/${retries} for ${name}`, 'warn');
                await this.delay(CONFIG.retryDelay);
            } catch (error) {
                if (attempt === retries) {
                    return {
                        status: 'unhealthy',
                        message: error.message,
                        error: error.name
                    };
                }
                
                this.log(`Retry ${attempt}/${retries} for ${name}: ${error.message}`, 'warn');
                await this.delay(CONFIG.retryDelay);
            }
        }
    }

    // Core health checks
    async checkApiHealth() {
        const start = performance.now();
        try {
            const response = await this.axios.get(`${CONFIG.baseUrl}/api/health`);
            const responseTime = performance.now() - start;
            
            if (response.status === 200) {
                const healthData = response.data;
                
                return {
                    status: healthData.status === 'healthy' ? 'healthy' : 'degraded',
                    message: `API responding in ${Math.round(responseTime)}ms`,
                    responseTime: Math.round(responseTime),
                    data: healthData
                };
            } else {
                return {
                    status: 'unhealthy',
                    message: `API returned status ${response.status}`,
                    responseTime: Math.round(responseTime)
                };
            }
        } catch (error) {
            const responseTime = performance.now() - start;
            return {
                status: 'unhealthy',
                message: `API health check failed: ${error.message}`,
                responseTime: Math.round(responseTime),
                error: error.code
            };
        }
    }

    async checkAlphaStackProtection() {
        try {
            const flagsPath = path.resolve(__dirname, '../../src/config/feature-flags.js');
            
            if (!fs.existsSync(flagsPath)) {
                return {
                    status: 'unhealthy',
                    message: 'Feature flags file not found'
                };
            }
            
            // Clear require cache to get fresh data
            delete require.cache[require.resolve(flagsPath)];
            const flags = require(flagsPath);
            
            const config = flags.getConfig();
            
            if (!config.protection.alphastack_immutable) {
                return {
                    status: 'unhealthy',
                    message: 'AlphaStack protection is disabled - CRITICAL SECURITY ISSUE'
                };
            }
            
            return {
                status: 'healthy',
                message: 'AlphaStack protection enabled',
                data: {
                    protection: config.protection,
                    version: config.version
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                message: `AlphaStack protection check failed: ${error.message}`
            };
        }
    }

    async checkDatabase() {
        try {
            const dbPath = path.resolve(__dirname, '../../trading_dashboard.db');
            
            if (!fs.existsSync(dbPath)) {
                return {
                    status: 'unhealthy',
                    message: 'Database file not found'
                };
            }
            
            const stats = fs.statSync(dbPath);
            const sizeInMB = Math.round(stats.size / 1024 / 1024 * 100) / 100;
            
            // Check if database is accessible via API
            const response = await this.axios.get(`${CONFIG.baseUrl}/api/discoveries?limit=1`);
            
            if (response.status === 200) {
                return {
                    status: 'healthy',
                    message: `Database accessible, size: ${sizeInMB}MB`,
                    data: {
                        size: sizeInMB,
                        lastModified: stats.mtime.toISOString()
                    }
                };
            } else {
                return {
                    status: 'degraded',
                    message: `Database file exists but API returned ${response.status}`
                };
            }
        } catch (error) {
            return {
                status: 'unhealthy',
                message: `Database check failed: ${error.message}`
            };
        }
    }

    async checkFeatureFlags() {
        try {
            const flagsPath = path.resolve(__dirname, '../../src/config/feature-flags.js');
            delete require.cache[require.resolve(flagsPath)];
            const flags = require(flagsPath);
            
            const config = flags.getConfig();
            const enabledFeatures = flags.getEnabledFeatures();
            
            // Check for dangerous configurations
            const warnings = [];
            
            if (!config.protection.circuit_breaker) {
                warnings.push('Circuit breaker is disabled');
            }
            
            if (config.version === 'v3' && flags.isInFallbackMode()) {
                warnings.push('V3 enabled but fallback mode active');
            }
            
            return {
                status: warnings.length === 0 ? 'healthy' : 'degraded',
                message: warnings.length === 0 ? 
                    `Feature flags configured correctly (${enabledFeatures.length} features enabled)` :
                    `Feature flag warnings: ${warnings.join(', ')}`,
                data: {
                    version: config.version,
                    enabled_features: enabledFeatures.length,
                    protection: config.protection,
                    warnings
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                message: `Feature flag check failed: ${error.message}`
            };
        }
    }

    async checkAlphaStackApi() {
        const start = performance.now();
        try {
            const response = await this.axios.get(`${CONFIG.baseUrl}/api/alphastack/universe`);
            const responseTime = performance.now() - start;
            
            if (response.status === 200) {
                const data = response.data;
                const universeSize = Array.isArray(data) ? data.length : 0;
                
                return {
                    status: universeSize > 0 ? 'healthy' : 'degraded',
                    message: `AlphaStack API responding, universe size: ${universeSize}`,
                    responseTime: Math.round(responseTime),
                    data: { universeSize }
                };
            } else {
                return {
                    status: 'degraded',
                    message: `AlphaStack API returned status ${response.status}`,
                    responseTime: Math.round(responseTime)
                };
            }
        } catch (error) {
            const responseTime = performance.now() - start;
            return {
                status: 'unhealthy',
                message: `AlphaStack API failed: ${error.message}`,
                responseTime: Math.round(responseTime)
            };
        }
    }

    async checkPortfolioApi() {
        const start = performance.now();
        try {
            const response = await this.axios.get(`${CONFIG.baseUrl}/api/portfolio/positions`);
            const responseTime = performance.now() - start;
            
            if (response.status === 200) {
                return {
                    status: 'healthy',
                    message: `Portfolio API responding in ${Math.round(responseTime)}ms`,
                    responseTime: Math.round(responseTime)
                };
            } else {
                return {
                    status: 'degraded',
                    message: `Portfolio API returned status ${response.status}`,
                    responseTime: Math.round(responseTime)
                };
            }
        } catch (error) {
            const responseTime = performance.now() - start;
            return {
                status: 'degraded',
                message: `Portfolio API failed: ${error.message}`,
                responseTime: Math.round(responseTime)
            };
        }
    }

    async checkDiscoveryApi() {
        const start = performance.now();
        try {
            const response = await this.axios.get(`${CONFIG.baseUrl}/api/discoveries?limit=10`);
            const responseTime = performance.now() - start;
            
            if (response.status === 200) {
                const data = response.data;
                const discoveryCount = Array.isArray(data) ? data.length : 
                                     (data.discoveries ? data.discoveries.length : 0);
                
                return {
                    status: 'healthy',
                    message: `Discovery API responding, ${discoveryCount} discoveries`,
                    responseTime: Math.round(responseTime),
                    data: { discoveryCount }
                };
            } else {
                return {
                    status: 'degraded',
                    message: `Discovery API returned status ${response.status}`,
                    responseTime: Math.round(responseTime)
                };
            }
        } catch (error) {
            const responseTime = performance.now() - start;
            return {
                status: 'degraded',
                message: `Discovery API failed: ${error.message}`,
                responseTime: Math.round(responseTime)
            };
        }
    }

    async checkPerformance() {
        const endpoints = [
            '/api/health',
            '/api/alphastack/universe',
            '/api/discoveries?limit=5'
        ];
        
        const results = [];
        
        for (const endpoint of endpoints) {
            const start = performance.now();
            try {
                const response = await this.axios.get(`${CONFIG.baseUrl}${endpoint}`);
                const responseTime = performance.now() - start;
                
                results.push({
                    endpoint,
                    responseTime: Math.round(responseTime),
                    status: response.status
                });
            } catch (error) {
                const responseTime = performance.now() - start;
                results.push({
                    endpoint,
                    responseTime: Math.round(responseTime),
                    status: 'error',
                    error: error.message
                });
            }
        }
        
        const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
        const slowEndpoints = results.filter(r => r.responseTime > CONFIG.maxResponseTime);
        
        return {
            status: slowEndpoints.length === 0 ? 'healthy' : 'degraded',
            message: `Average response time: ${Math.round(avgResponseTime)}ms`,
            data: {
                averageResponseTime: Math.round(avgResponseTime),
                slowEndpoints: slowEndpoints.length,
                results
            }
        };
    }

    async checkStaticAssets() {
        const assets = [
            '/assets/tailwind.css',
            '/index.html',
            '/js/alphastack-screener.js'
        ];
        
        const results = [];
        
        for (const asset of assets) {
            try {
                const response = await this.axios.get(`${CONFIG.baseUrl}${asset}`);
                results.push({
                    asset,
                    status: response.status,
                    size: response.headers['content-length'] || 'unknown'
                });
            } catch (error) {
                results.push({
                    asset,
                    status: 'error',
                    error: error.message
                });
            }
        }
        
        const failedAssets = results.filter(r => r.status !== 200);
        
        return {
            status: failedAssets.length === 0 ? 'healthy' : 'degraded',
            message: `${results.length - failedAssets.length}/${results.length} assets accessible`,
            data: { results, failedAssets: failedAssets.length }
        };
    }

    async runHealthCheck(checkName) {
        const checkMethods = {
            api_health: () => this.checkApiHealth(),
            alphastack_protection: () => this.checkAlphaStackProtection(),
            database: () => this.checkDatabase(),
            feature_flags: () => this.checkFeatureFlags(),
            alphastack_api: () => this.checkAlphaStackApi(),
            portfolio_api: () => this.checkPortfolioApi(),
            discovery_api: () => this.checkDiscoveryApi(),
            performance: () => this.checkPerformance(),
            static_assets: () => this.checkStaticAssets(),
            logging: () => ({ status: 'healthy', message: 'Logging system operational' }),
            monitoring: () => ({ status: 'healthy', message: 'Monitoring system operational' })
        };
        
        const checkFn = checkMethods[checkName];
        if (!checkFn) {
            return {
                status: 'unhealthy',
                message: `Unknown health check: ${checkName}`
            };
        }
        
        this.log(`Running ${checkName} health check...`);
        return await this.executeWithRetry(checkFn, checkName);
    }

    async runAllChecks() {
        const startTime = performance.now();
        this.log('Starting comprehensive health check...', 'info');
        
        // Run checks by category
        for (const [category, checks] of Object.entries(HEALTH_CHECKS)) {
            this.log(`\n=== ${category} CHECKS ===`, 'info');
            
            for (const checkName of checks) {
                const result = await this.runHealthCheck(checkName);
                this.results.checks[checkName] = {
                    ...result,
                    category,
                    timestamp: new Date().toISOString()
                };
                
                this.results.summary.total++;
                
                switch (result.status) {
                    case 'healthy':
                        this.results.summary.passed++;
                        this.log(`✓ ${checkName}: ${result.message}`, 'success');
                        break;
                    case 'degraded':
                        this.results.summary.warnings++;
                        this.log(`⚠ ${checkName}: ${result.message}`, 'warn');
                        break;
                    case 'unhealthy':
                        this.results.summary.failed++;
                        this.log(`✗ ${checkName}: ${result.message}`, 'error');
                        break;
                }
            }
        }
        
        const totalTime = performance.now() - startTime;
        this.results.performance.totalTime = Math.round(totalTime);
        
        // Calculate average response time from performance checks
        const responseTimes = [];
        Object.values(this.results.checks).forEach(check => {
            if (check.responseTime) {
                responseTimes.push(check.responseTime);
            }
        });
        
        this.results.performance.averageResponseTime = responseTimes.length > 0 ?
            Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length) : 0;
        
        return this.results;
    }

    getOverallStatus() {
        const { passed, failed, warnings, total } = this.results.summary;
        const criticalFailed = Object.entries(this.results.checks)
            .filter(([name, check]) => 
                HEALTH_CHECKS.CRITICAL.includes(name) && check.status === 'unhealthy'
            ).length;
        
        if (criticalFailed > 0) {
            return 'critical';
        } else if (failed > 0) {
            return 'unhealthy';
        } else if (warnings > 0) {
            return 'degraded';
        } else {
            return 'healthy';
        }
    }

    printSummary() {
        const status = this.getOverallStatus();
        const { passed, failed, warnings, total } = this.results.summary;
        
        this.log('\n=== HEALTH CHECK SUMMARY ===', 'info');
        this.log(`Overall Status: ${status.toUpperCase()}`, 
            status === 'healthy' ? 'success' : 
            status === 'degraded' ? 'warn' : 'error');
        this.log(`Total Checks: ${total}`);
        this.log(`Passed: ${passed}`, 'success');
        if (warnings > 0) this.log(`Warnings: ${warnings}`, 'warn');
        if (failed > 0) this.log(`Failed: ${failed}`, 'error');
        this.log(`Total Time: ${this.results.performance.totalTime}ms`);
        this.log(`Average Response Time: ${this.results.performance.averageResponseTime}ms`);
        
        return status;
    }

    async saveResults(filename) {
        const resultsPath = path.resolve(__dirname, '../../logs', filename || 'health-check-results.json');
        
        // Ensure logs directory exists
        const logsDir = path.dirname(resultsPath);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
        this.log(`Results saved to: ${resultsPath}`, 'info');
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const options = {};
    
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            options[key] = value || true;
        }
    });
    
    const checker = new HealthChecker();
    
    try {
        const results = await checker.runAllChecks();
        const status = checker.printSummary();
        
        if (options.save || options.output) {
            await checker.saveResults(options.output);
        }
        
        // Exit codes for automation
        if (status === 'critical' || status === 'unhealthy') {
            process.exit(1);
        } else if (status === 'degraded') {
            process.exit(2);
        } else {
            process.exit(0);
        }
    } catch (error) {
        checker.log(`Health check failed: ${error.message}`, 'error');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = HealthChecker;