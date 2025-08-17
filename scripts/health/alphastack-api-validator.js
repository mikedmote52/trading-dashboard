#!/usr/bin/env node
/**
 * AlphaStack API Validator
 * Specific validation for AlphaStack discovery engine functionality
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AlphaStackValidator {
    constructor(baseUrl = process.env.DEPLOY_URL || 'http://localhost:3001') {
        this.baseUrl = baseUrl;
        this.axios = axios.create({
            timeout: 10000,
            validateStatus: (status) => status < 500
        });
        
        this.results = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            alphastack_status: 'unknown',
            tests: {},
            performance: {},
            protection_status: 'unknown'
        };
    }

    log(message, level = 'info') {
        const colors = {
            error: '\x1b[31m',
            warn: '\x1b[33m',
            success: '\x1b[32m',
            info: '\x1b[34m',
            reset: '\x1b[0m'
        };
        
        const color = colors[level] || colors.reset;
        console.log(`${color}[AlphaStack] ${message}${colors.reset}`);
    }

    async validateProtectionStatus() {
        this.log('Validating AlphaStack protection status...');
        
        try {
            const flagsPath = path.resolve(__dirname, '../../src/config/feature-flags.js');
            
            if (!fs.existsSync(flagsPath)) {
                throw new Error('Feature flags file not found');
            }
            
            // Clear require cache for fresh data
            delete require.cache[require.resolve(flagsPath)];
            const flags = require(flagsPath);
            
            const config = flags.getConfig();
            const isProtected = config.protection.alphastack_immutable;
            
            this.results.protection_status = isProtected ? 'protected' : 'vulnerable';
            this.results.tests.protection = {
                status: isProtected ? 'pass' : 'fail',
                message: isProtected ? 'AlphaStack protection enabled' : 'CRITICAL: AlphaStack protection disabled',
                details: {
                    alphastack_immutable: config.protection.alphastack_immutable,
                    read_only_mode: config.protection.read_only_mode,
                    circuit_breaker: config.protection.circuit_breaker,
                    version: config.version
                }
            };
            
            if (!isProtected) {
                this.log('CRITICAL: AlphaStack protection is disabled!', 'error');
                return false;
            }
            
            this.log('✓ AlphaStack protection verified', 'success');
            return true;
        } catch (error) {
            this.results.tests.protection = {
                status: 'error',
                message: `Protection validation failed: ${error.message}`
            };
            this.log(`Protection validation error: ${error.message}`, 'error');
            return false;
        }
    }

    async validateUniverseEndpoint() {
        this.log('Testing AlphaStack universe endpoint...');
        
        const start = Date.now();
        try {
            const response = await this.axios.get(`${this.baseUrl}/api/alphastack/universe`);
            const responseTime = Date.now() - start;
            
            if (response.status === 200) {
                const data = response.data;
                const universeSize = Array.isArray(data) ? data.length : 0;
                
                this.results.tests.universe = {
                    status: universeSize > 0 ? 'pass' : 'warn',
                    message: `Universe endpoint responded with ${universeSize} stocks`,
                    responseTime,
                    details: {
                        universeSize,
                        sampleSymbols: Array.isArray(data) ? data.slice(0, 5).map(stock => stock.symbol || stock) : []
                    }
                };
                
                this.results.performance.universe_response_time = responseTime;
                
                if (universeSize === 0) {
                    this.log('⚠ Universe endpoint returned empty data', 'warn');
                    return false;
                }
                
                this.log(`✓ Universe endpoint: ${universeSize} stocks in ${responseTime}ms`, 'success');
                return true;
            } else {
                this.results.tests.universe = {
                    status: 'fail',
                    message: `Universe endpoint returned status ${response.status}`,
                    responseTime
                };
                this.log(`✗ Universe endpoint failed: ${response.status}`, 'error');
                return false;
            }
        } catch (error) {
            const responseTime = Date.now() - start;
            this.results.tests.universe = {
                status: 'error',
                message: `Universe endpoint error: ${error.message}`,
                responseTime
            };
            this.log(`✗ Universe endpoint error: ${error.message}`, 'error');
            return false;
        }
    }

    async validateDiscoveryEndpoint() {
        this.log('Testing discovery endpoint...');
        
        const start = Date.now();
        try {
            const response = await this.axios.get(`${this.baseUrl}/api/discoveries?limit=10`);
            const responseTime = Date.now() - start;
            
            if (response.status === 200) {
                const data = response.data;
                const discoveries = Array.isArray(data) ? data : (data.discoveries || []);
                
                this.results.tests.discovery = {
                    status: 'pass',
                    message: `Discovery endpoint returned ${discoveries.length} discoveries`,
                    responseTime,
                    details: {
                        discoveryCount: discoveries.length,
                        sampleDiscoveries: discoveries.slice(0, 3).map(d => ({
                            symbol: d.symbol,
                            score: d.vigl_score || d.score,
                            action: d.action
                        }))
                    }
                };
                
                this.results.performance.discovery_response_time = responseTime;
                this.log(`✓ Discovery endpoint: ${discoveries.length} discoveries in ${responseTime}ms`, 'success');
                return true;
            } else {
                this.results.tests.discovery = {
                    status: 'fail',
                    message: `Discovery endpoint returned status ${response.status}`,
                    responseTime
                };
                this.log(`✗ Discovery endpoint failed: ${response.status}`, 'error');
                return false;
            }
        } catch (error) {
            const responseTime = Date.now() - start;
            this.results.tests.discovery = {
                status: 'error',
                message: `Discovery endpoint error: ${error.message}`,
                responseTime
            };
            this.log(`✗ Discovery endpoint error: ${error.message}`, 'error');
            return false;
        }
    }

    async validateScanFunctionality() {
        this.log('Testing scan functionality...');
        
        const start = Date.now();
        try {
            // Test scan endpoint
            const response = await this.axios.get(`${this.baseUrl}/api/v2/scan`);
            const responseTime = Date.now() - start;
            
            if (response.status === 200) {
                const data = response.data;
                
                this.results.tests.scan = {
                    status: 'pass',
                    message: 'Scan functionality operational',
                    responseTime,
                    details: {
                        scanActive: data.scanning || false,
                        lastScan: data.lastScan || null,
                        scanCount: data.scanCount || 0
                    }
                };
                
                this.results.performance.scan_response_time = responseTime;
                this.log(`✓ Scan functionality verified in ${responseTime}ms`, 'success');
                return true;
            } else {
                this.results.tests.scan = {
                    status: 'fail',
                    message: `Scan endpoint returned status ${response.status}`,
                    responseTime
                };
                this.log(`✗ Scan endpoint failed: ${response.status}`, 'error');
                return false;
            }
        } catch (error) {
            const responseTime = Date.now() - start;
            this.results.tests.scan = {
                status: 'error',
                message: `Scan functionality error: ${error.message}`,
                responseTime
            };
            this.log(`✗ Scan functionality error: ${error.message}`, 'error');
            return false;
        }
    }

    async validateVIGLScoring() {
        this.log('Testing VIGL scoring system...');
        
        try {
            // Test a few symbols to ensure scoring works
            const testSymbols = ['AAPL', 'TSLA', 'NVDA'];
            const scoringResults = [];
            
            for (const symbol of testSymbols) {
                const start = Date.now();
                try {
                    const response = await this.axios.get(`${this.baseUrl}/api/alphastack/score/${symbol}`);
                    const responseTime = Date.now() - start;
                    
                    if (response.status === 200) {
                        scoringResults.push({
                            symbol,
                            score: response.data.score || response.data.vigl_score,
                            responseTime,
                            status: 'success'
                        });
                    } else {
                        scoringResults.push({
                            symbol,
                            responseTime,
                            status: 'failed',
                            error: `Status ${response.status}`
                        });
                    }
                } catch (error) {
                    const responseTime = Date.now() - start;
                    scoringResults.push({
                        symbol,
                        responseTime,
                        status: 'error',
                        error: error.message
                    });
                }
            }
            
            const successful = scoringResults.filter(r => r.status === 'success').length;
            const avgResponseTime = scoringResults.reduce((sum, r) => sum + r.responseTime, 0) / scoringResults.length;
            
            this.results.tests.vigl_scoring = {
                status: successful > 0 ? 'pass' : 'fail',
                message: `VIGL scoring: ${successful}/${testSymbols.length} symbols processed`,
                details: {
                    successful,
                    total: testSymbols.length,
                    averageResponseTime: Math.round(avgResponseTime),
                    results: scoringResults
                }
            };
            
            this.results.performance.vigl_scoring_avg_time = Math.round(avgResponseTime);
            
            if (successful === 0) {
                this.log('✗ VIGL scoring system failed for all test symbols', 'error');
                return false;
            }
            
            this.log(`✓ VIGL scoring: ${successful}/${testSymbols.length} symbols, avg ${Math.round(avgResponseTime)}ms`, 'success');
            return true;
        } catch (error) {
            this.results.tests.vigl_scoring = {
                status: 'error',
                message: `VIGL scoring validation error: ${error.message}`
            };
            this.log(`✗ VIGL scoring validation error: ${error.message}`, 'error');
            return false;
        }
    }

    async validateDataIntegrity() {
        this.log('Validating data integrity...');
        
        try {
            // Check critical data files
            const dataPath = path.resolve(__dirname, '../../data');
            const criticalFiles = [
                'universe.json',
                'providers/fundamentals.json',
                'providers/liquidity.json'
            ];
            
            const fileChecks = [];
            
            for (const file of criticalFiles) {
                const filePath = path.join(dataPath, file);
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
                    
                    fileChecks.push({
                        file,
                        exists: true,
                        size: stats.size,
                        ageHours: Math.round(ageHours * 10) / 10,
                        status: ageHours < 24 ? 'fresh' : 'stale'
                    });
                } else {
                    fileChecks.push({
                        file,
                        exists: false,
                        status: 'missing'
                    });
                }
            }
            
            const missingFiles = fileChecks.filter(f => !f.exists).length;
            const staleFiles = fileChecks.filter(f => f.status === 'stale').length;
            
            this.results.tests.data_integrity = {
                status: missingFiles === 0 ? (staleFiles === 0 ? 'pass' : 'warn') : 'fail',
                message: `Data integrity: ${fileChecks.length - missingFiles}/${fileChecks.length} files present`,
                details: {
                    fileChecks,
                    missingFiles,
                    staleFiles
                }
            };
            
            if (missingFiles > 0) {
                this.log(`✗ Data integrity: ${missingFiles} critical files missing`, 'error');
                return false;
            } else if (staleFiles > 0) {
                this.log(`⚠ Data integrity: ${staleFiles} files are stale (>24h old)`, 'warn');
                return true;
            } else {
                this.log('✓ Data integrity: All critical files present and fresh', 'success');
                return true;
            }
        } catch (error) {
            this.results.tests.data_integrity = {
                status: 'error',
                message: `Data integrity check error: ${error.message}`
            };
            this.log(`✗ Data integrity error: ${error.message}`, 'error');
            return false;
        }
    }

    async runFullValidation() {
        this.log('Starting AlphaStack API validation...', 'info');
        
        const validations = [
            { name: 'Protection Status', fn: () => this.validateProtectionStatus() },
            { name: 'Universe Endpoint', fn: () => this.validateUniverseEndpoint() },
            { name: 'Discovery Endpoint', fn: () => this.validateDiscoveryEndpoint() },
            { name: 'Scan Functionality', fn: () => this.validateScanFunctionality() },
            { name: 'VIGL Scoring', fn: () => this.validateVIGLScoring() },
            { name: 'Data Integrity', fn: () => this.validateDataIntegrity() }
        ];
        
        let passed = 0;
        let failed = 0;
        let warnings = 0;
        
        for (const validation of validations) {
            this.log(`\n--- ${validation.name} ---`);
            try {
                const result = await validation.fn();
                if (result === true) {
                    passed++;
                } else if (result === false) {
                    failed++;
                } else {
                    warnings++;
                }
            } catch (error) {
                this.log(`${validation.name} failed: ${error.message}`, 'error');
                failed++;
            }
        }
        
        // Determine overall status
        if (failed > 0 || this.results.protection_status === 'vulnerable') {
            this.results.alphastack_status = 'unhealthy';
        } else if (warnings > 0) {
            this.results.alphastack_status = 'degraded';
        } else {
            this.results.alphastack_status = 'healthy';
        }
        
        this.printSummary(passed, failed, warnings);
        return this.results;
    }

    printSummary(passed, failed, warnings) {
        this.log('\n=== ALPHASTACK VALIDATION SUMMARY ===', 'info');
        this.log(`Overall Status: ${this.results.alphastack_status.toUpperCase()}`, 
            this.results.alphastack_status === 'healthy' ? 'success' : 
            this.results.alphastack_status === 'degraded' ? 'warn' : 'error');
        this.log(`Protection Status: ${this.results.protection_status.toUpperCase()}`,
            this.results.protection_status === 'protected' ? 'success' : 'error');
        this.log(`Passed: ${passed}`, 'success');
        if (warnings > 0) this.log(`Warnings: ${warnings}`, 'warn');
        if (failed > 0) this.log(`Failed: ${failed}`, 'error');
        
        // Performance summary
        const perfData = this.results.performance;
        if (Object.keys(perfData).length > 0) {
            this.log('\nPerformance Summary:');
            Object.entries(perfData).forEach(([key, value]) => {
                this.log(`  ${key}: ${value}ms`);
            });
        }
    }

    async saveResults(filename) {
        const resultsPath = path.resolve(__dirname, '../../logs', filename || 'alphastack-validation.json');
        
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
    const baseUrl = args.find(arg => arg.startsWith('--url='))?.split('=')[1];
    const saveResults = args.includes('--save');
    const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];
    
    const validator = new AlphaStackValidator(baseUrl);
    
    try {
        const results = await validator.runFullValidation();
        
        if (saveResults || outputFile) {
            await validator.saveResults(outputFile);
        }
        
        // Exit codes for automation
        switch (results.alphastack_status) {
            case 'healthy':
                process.exit(0);
            case 'degraded':
                process.exit(1);
            case 'unhealthy':
                process.exit(2);
            default:
                process.exit(3);
        }
    } catch (error) {
        console.error(`AlphaStack validation failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AlphaStackValidator;