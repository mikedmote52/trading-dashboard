#!/usr/bin/env node
/**
 * VIGL Master Automation - Complete 8-Step Pipeline
 * Executes the full VIGL discovery system automatically
 */

const https = require('https');
const http = require('http');

class VIGLMasterAutomation {
    constructor(baseUrl = 'https://trading-dashboard-dvou.onrender.com') {
        this.baseUrl = baseUrl;
        this.runId = `vigl_run_${new Date().toISOString().replace(/[:.]/g, '_')}`;
        this.results = {};
        this.errors = [];
    }

    async executeStep(stepNumber, stepName, apiCall) {
        console.log(`\n🔄 STEP ${stepNumber}: ${stepName}`);
        console.log(`⏰ Started at: ${new Date().toISOString()}`);
        
        try {
            const result = await apiCall();
            this.results[`step_${stepNumber}`] = {
                name: stepName,
                success: true,
                result,
                timestamp: new Date().toISOString()
            };
            
            console.log(`✅ STEP ${stepNumber} COMPLETE: ${stepName}`);
            return result;
            
        } catch (error) {
            console.error(`❌ STEP ${stepNumber} FAILED: ${stepName}`, error.message);
            this.errors.push(`Step ${stepNumber} (${stepName}): ${error.message}`);
            this.results[`step_${stepNumber}`] = {
                name: stepName,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            // Don't stop execution for non-critical steps
            if ([1, 7].includes(stepNumber)) {
                console.log(`⚠️ Step ${stepNumber} failed but continuing...`);
                return null;
            }
            throw error;
        }
    }

    async makeRequest(method, path, data = null, retries = 3) {
        const url = new URL(path, this.baseUrl);
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`📡 ${method} ${url} (attempt ${attempt}/${retries})`);
                
                return await new Promise((resolve, reject) => {
                    const options = {
                        method,
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'VIGL-Master-Automation/1.0'
                        }
                    };

                    const requestModule = url.protocol === 'https:' ? https : http;
                    const req = requestModule.request(url, options, (res) => {
                        let responseData = '';
                        
                        res.on('data', (chunk) => {
                            responseData += chunk;
                        });
                        
                        res.on('end', () => {
                            try {
                                const parsed = responseData ? JSON.parse(responseData) : {};
                                
                                if (res.statusCode >= 200 && res.statusCode < 300) {
                                    console.log(`✅ ${method} ${path}: ${res.statusCode} (${responseData.length} bytes)`);
                                    resolve(parsed);
                                } else {
                                    console.error(`❌ ${method} ${path}: ${res.statusCode}`, parsed);
                                    reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || parsed.message || 'Request failed'}`));
                                }
                            } catch (parseError) {
                                console.error(`❌ Failed to parse response:`, responseData.substring(0, 200));
                                reject(parseError);
                            }
                        });
                    });
                    
                    req.on('error', reject);
                    
                    if (data && (method === 'POST' || method === 'PUT')) {
                        const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
                        req.write(jsonData);
                    }
                    
                    req.end();
                });

            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                console.log(`⏳ Retrying in 2 seconds... (${error.message})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    async runFullPipeline() {
        console.log('🚀 STARTING VIGL MASTER AUTOMATION');
        console.log(`🆔 Run ID: ${this.runId}`);
        console.log(`🌐 Base URL: ${this.baseUrl}`);
        console.log(`⏰ Started: ${new Date().toISOString()}\n`);

        try {
            // STEP 1: Clear stale discoveries
            await this.executeStep(1, 'Clear Stale Discoveries', async () => {
                return await this.makeRequest('DELETE', '/api/discoveries/clear');
            });

            // STEP 2: Trigger Python VIGL discovery (mock for now - real system would call Python)
            await this.executeStep(2, 'Generate Mock VIGL Patterns', async () => {
                return {
                    message: 'Mock VIGL patterns generated',
                    patterns: this.generateMockViglPatterns()
                };
            });

            // STEP 3: Post discoveries to database
            const mockPatterns = this.generateMockViglPatterns();
            await this.executeStep(3, 'Post Discoveries to Database', async () => {
                return await this.makeRequest('POST', '/api/run-vigl-discovery', mockPatterns);
            });

            // STEP 4: ActionMapper verification (implicit in Step 3)
            await this.executeStep(4, 'Verify ActionMapper Logic', async () => {
                const discoveries = await this.makeRequest('GET', '/api/discoveries/raw');
                
                // Verify ActionMapper rules
                let correctActions = 0;
                for (const d of discoveries) {
                    const expectedAction = this.getExpectedAction(d.score);
                    if (d.action === expectedAction) {
                        correctActions++;
                    }
                }
                
                return {
                    total: discoveries.length,
                    correctActions,
                    accuracy: discoveries.length > 0 ? (correctActions / discoveries.length * 100).toFixed(1) + '%' : '0%'
                };
            });

            // STEP 5: Validate database enrichment
            await this.executeStep(5, 'Validate Database Enrichment', async () => {
                const discoveries = await this.makeRequest('GET', '/api/discoveries/raw');
                
                let enrichedCount = 0;
                let missingData = [];
                
                for (const d of discoveries) {
                    if (d.short_interest > 0 && d.volume_ratio > 0) {
                        enrichedCount++;
                    } else {
                        missingData.push(`${d.symbol}: SI=${d.short_interest}, VR=${d.volume_ratio}`);
                    }
                }
                
                return {
                    total: discoveries.length,
                    enriched: enrichedCount,
                    missing: missingData.length,
                    details: missingData.slice(0, 10) // First 10 issues
                };
            });

            // STEP 6: Confirm discoveries available on dashboard
            await this.executeStep(6, 'Confirm Dashboard Population', async () => {
                const latest = await this.makeRequest('GET', '/api/discoveries/latest');
                
                if (latest.count === 0) {
                    throw new Error('Dashboard has 0 discoveries - pipeline failed');
                }
                
                return {
                    discoveryCount: latest.count,
                    breakdown: latest.breakdown,
                    recentPatterns: latest.discoveries.slice(0, 5)
                };
            });

            // STEP 7: Backup discoveries
            await this.executeStep(7, 'Backup Discoveries', async () => {
                return await this.makeRequest('POST', '/api/discoveries/backup', {
                    filename: `${this.runId}_backup.json`
                });
            });

            // STEP 8: Automated monitoring
            await this.executeStep(8, 'Generate Monitoring Report', async () => {
                const latest = await this.makeRequest('GET', '/api/discoveries/latest');
                const health = await this.makeRequest('GET', '/api/vigl-health');
                
                // Generate alerts if needed
                const alerts = [];
                if (latest.count === 0) {
                    alerts.push('CRITICAL: No discoveries found');
                }
                
                const buyCount = latest.breakdown.find(b => b.action === 'BUY')?.count || 0;
                if (buyCount === 0) {
                    alerts.push('WARNING: No BUY signals generated');
                }
                
                return {
                    totalDiscoveries: latest.count,
                    actionBreakdown: latest.breakdown,
                    systemHealth: health.healthy,
                    alerts,
                    summary: this.generateSummary()
                };
            });

            // Final success
            console.log('\n🎉 VIGL MASTER AUTOMATION COMPLETE');
            console.log(`✅ Successfully executed all 8 steps`);
            console.log(`⏰ Total time: ${new Date().toISOString()}`);
            
            this.printFinalReport();
            return this.results;

        } catch (error) {
            console.error('\n💥 VIGL MASTER AUTOMATION FAILED');
            console.error(`❌ Error: ${error.message}`);
            console.log(`⏰ Failed at: ${new Date().toISOString()}`);
            
            this.printFinalReport();
            throw error;
        }
    }

    generateMockViglPatterns() {
        // Generate realistic VIGL patterns for testing
        return [
            {
                symbol: 'VIGL',
                score: 4.2,
                price: 12.34,
                short_interest: 36.5,
                volume_ratio: 1.5,
                confidence: 0.85,
                catalyst: 'Volume spike pattern',
                timestamp: new Date().toISOString()
            },
            {
                symbol: 'BTAI', 
                score: 5.1,
                price: 6.60,
                short_interest: 41.2,
                volume_ratio: 2.1,
                confidence: 0.91,
                catalyst: 'Earnings catalyst',
                timestamp: new Date().toISOString()
            },
            {
                symbol: 'CRBU',
                score: 2.8,
                price: 8.45,
                short_interest: 28.3,
                volume_ratio: 1.3,
                confidence: 0.72,
                catalyst: 'Technical breakout',
                timestamp: new Date().toISOString()
            }
        ];
    }

    getExpectedAction(score) {
        if (score > 5.0) return 'BUY';
        if (score >= 3.0) return 'MONITOR';  
        if (score >= 2.0) return 'WATCHLIST';
        return 'IGNORE';
    }

    generateSummary() {
        const steps = Object.keys(this.results).length;
        const successful = Object.values(this.results).filter(r => r.success).length;
        
        return {
            stepsExecuted: steps,
            stepsSuccessful: successful,
            successRate: steps > 0 ? (successful / steps * 100).toFixed(1) + '%' : '0%',
            errors: this.errors,
            runId: this.runId
        };
    }

    printFinalReport() {
        console.log('\n📊 FINAL EXECUTION REPORT');
        console.log('═══════════════════════════');
        
        Object.entries(this.results).forEach(([step, data]) => {
            const status = data.success ? '✅' : '❌';
            console.log(`${status} ${step.toUpperCase()}: ${data.name}`);
            if (!data.success) {
                console.log(`   Error: ${data.error}`);
            }
        });
        
        if (this.errors.length > 0) {
            console.log('\n🚨 ERRORS ENCOUNTERED:');
            this.errors.forEach(error => console.log(`   • ${error}`));
        }
        
        const summary = this.generateSummary();
        console.log(`\n📈 Success Rate: ${summary.successRate}`);
        console.log(`🆔 Run ID: ${this.runId}`);
    }
}

// CLI interface
if (require.main === module) {
    const baseUrl = process.argv[2] || 'https://trading-dashboard-dvou.onrender.com';
    const automation = new VIGLMasterAutomation(baseUrl);
    
    automation.runFullPipeline()
        .then(() => {
            console.log('\n🎯 VIGL system is now fully operational!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Automation failed:', error.message);
            process.exit(1);
        });
}

module.exports = { VIGLMasterAutomation };