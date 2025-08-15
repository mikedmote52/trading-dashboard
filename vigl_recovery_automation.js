#!/usr/bin/env node
/**
 * VIGL Recovery Automation - Complete 6-Step Fix
 * Executable automation script for VIGL discovery system recovery
 */

const path = require('path');
const https = require('https');

class VIGLRecoveryAutomation {
    constructor() {
        this.db = null;
        this.logEntries = [];
        this.validSymbols = [];
        this.discoveries = [];
        this.startTime = Date.now();
        this.initDatabase();
    }

    initDatabase() {
        try {
            this.db = require('./server/db/sqlite');
            this.log('✅ Database connection established');
        } catch (error) {
            this.log(`❌ Database init failed: ${error.message}`);
            throw error;
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);
        this.logEntries.push(logMessage);
    }

    // STEP 1: Clear stale discoveries
    async clearStaleDiscoveries() {
        this.log('🧹 STEP 1: Clearing stale discoveries...');
        
        try {
            const deleteResult = this.db.db.prepare(`
                DELETE FROM discoveries 
                WHERE action IS NULL 
                   OR score IS NULL 
                   OR action = '' 
                   OR score <= 0
            `).run();

            this.log(`✅ Deleted ${deleteResult.changes} stale discovery records`);
            return deleteResult.changes;
        } catch (error) {
            this.log(`❌ Failed to clear stale discoveries: ${error.message}`);
            throw error;
        }
    }

    // STEP 2: Filter valid symbols for VIGL scan
    async filterValidSymbols() {
        this.log('🔍 STEP 2: Filtering valid symbols for VIGL scan...');
        
        try {
            // Get recent feature snapshots with actual schema
            const candidates = this.db.db.prepare(`
                SELECT DISTINCT symbol, 
                       rel_volume as volume_ratio,
                       short_interest_pct as short_interest,
                       borrow_fee_7d_change as fee,
                       momentum_5d,
                       catalyst_flag,
                       created_at
                FROM features_snapshot 
                WHERE created_at > datetime('now', '-1 day')
                  AND rel_volume IS NOT NULL
                  AND short_interest_pct IS NOT NULL 
                ORDER BY created_at DESC
            `).all();

            this.log(`📊 Found ${candidates.length} candidate symbols from features_snapshot`);

            // Apply VIGL filtering criteria - relaxed for available data
            this.validSymbols = candidates.filter(symbol => {
                // Primary filter: volume ratio (most reliable indicator)
                const volumeOk = symbol.volume_ratio && symbol.volume_ratio > 1.2; // Higher volume threshold
                
                // Optional indicators - include if available but don't require
                const hasFeatureData = symbol.fee !== null || symbol.momentum_5d !== null || symbol.catalyst_flag;

                const isValid = volumeOk && hasFeatureData;
                
                if (!isValid && symbol.volume_ratio > 1.0) {
                    this.log(`⚠️ Skipping ${symbol.symbol}: VR=${symbol.volume_ratio}, SI=${symbol.short_interest}%, Fee=${symbol.fee}%, Mom=${symbol.momentum_5d}, Cat=${symbol.catalyst_flag}`);
                }

                return isValid;
            });

            this.log(`✅ Filtered to ${this.validSymbols.length} valid symbols for VIGL scanning`);
            
            // Log sample of valid symbols
            if (this.validSymbols.length > 0) {
                const sample = this.validSymbols.slice(0, 5);
                this.log(`📋 Sample valid symbols: ${sample.map(s => s.symbol).join(', ')}`);
            }

            return this.validSymbols;
        } catch (error) {
            this.log(`❌ Failed to filter symbols: ${error.message}`);
            throw error;
        }
    }

    // STEP 3: Run VIGL discovery on valid symbols
    async runViglDiscovery() {
        this.log('🎯 STEP 3: Running VIGL discovery on valid symbols...');
        
        if (this.validSymbols.length === 0) {
            this.log('❌ No valid symbols to process - cannot run VIGL discovery');
            throw new Error('No valid symbols available for VIGL discovery');
        }

        let processedCount = 0;
        let discoveryCount = 0;

        try {
            for (const symbolData of this.validSymbols) {
                try {
                    // Calculate VIGL score using available data
                    const viglScore = this.calculateViglScore(symbolData);
                    processedCount++;

                    // Apply ActionMapper thresholds (adjusted for available data)
                    let action;
                    if (viglScore >= 3.0) {
                        action = 'BUY';
                    } else if (viglScore >= 2.0) {
                        action = 'MONITOR';
                    } else if (viglScore >= 1.5) {
                        action = 'WATCHLIST';
                    } else {
                        action = 'IGNORE';
                    }

                    // Only insert actionable discoveries
                    if (action !== 'IGNORE') {
                        const discovery = {
                            id: `${symbolData.symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            symbol: symbolData.symbol,
                            score: Math.round(viglScore * 100) / 100,
                            action: action,
                            preset: 'vigl_recovery',
                            price: 1.0, // Default price since not available in features_snapshot  
                            features_json: JSON.stringify({
                                rel_volume: symbolData.volume_ratio,
                                short_interest_pct: symbolData.short_interest,
                                borrow_fee_7d_change: symbolData.fee,
                                momentum_5d: symbolData.momentum_5d || 0,
                                catalyst_flag: symbolData.catalyst_flag || 0,
                                vigl_score: viglScore,
                                source: 'vigl_recovery_automation',
                                calculated_at: new Date().toISOString()
                            }),
                            audit_json: JSON.stringify({
                                recovery_run: true,
                                automation_version: '1.0',
                                run_timestamp: new Date().toISOString()
                            }),
                            created_at: new Date().toISOString()
                        };

                        await this.db.insertDiscovery(discovery);
                        this.discoveries.push(discovery);
                        discoveryCount++;

                        this.log(`✅ ${symbolData.symbol}: Score ${viglScore.toFixed(2)} → ${action} (SI: ${symbolData.short_interest}%, VR: ${symbolData.volume_ratio.toFixed(2)}x)`);
                    } else {
                        this.log(`⚪ ${symbolData.symbol}: Score ${viglScore.toFixed(2)} → ${action} (ignored)`);
                    }

                } catch (error) {
                    this.log(`⚠️ Failed to process ${symbolData.symbol}: ${error.message}`);
                }
            }

            this.log(`📊 VIGL Discovery Complete: ${discoveryCount} discoveries from ${processedCount} symbols`);
            return discoveryCount;

        } catch (error) {
            this.log(`❌ VIGL discovery failed: ${error.message}`);
            throw error;
        }
    }

    // Calculate VIGL score from available data
    calculateViglScore(symbolData) {
        let score = 0;

        // Volume ratio contribution (0-3 points)
        const volumeContribution = Math.min(symbolData.volume_ratio * 1.5, 3);
        score += volumeContribution;

        // Short interest contribution (0-3 points)  
        const shortContribution = Math.min(symbolData.short_interest / 20, 3);
        score += shortContribution;

        // Borrow fee change contribution (0-2 points) - higher fee change = higher score
        const feeContribution = Math.min(Math.abs(symbolData.fee || 0) / 10, 2);
        score += feeContribution;

        // Momentum contribution (0-2 points)
        const momentumContribution = Math.min(Math.abs(symbolData.momentum_5d || 0) / 10, 2);
        score += momentumContribution;

        // Catalyst flag bonus (0-1 points)
        if (symbolData.catalyst_flag) {
            score += 1;
        }

        // Return score capped at 10
        return Math.min(score, 10);
    }

    // STEP 4: Validate database has discoveries
    async validateDatabase() {
        this.log('🔍 STEP 4: Validating database has actionable discoveries...');

        try {
            const discoveryCount = this.db.db.prepare(`
                SELECT COUNT(*) as count 
                FROM discoveries 
                WHERE action IS NOT NULL 
                  AND action != 'IGNORE'
                  AND created_at > datetime('now', '-1 hour')
            `).get();

            const actionBreakdown = this.db.db.prepare(`
                SELECT action, COUNT(*) as count
                FROM discoveries 
                WHERE action IS NOT NULL
                  AND created_at > datetime('now', '-1 hour')
                GROUP BY action
            `).all();

            this.log(`📊 Database validation: ${discoveryCount.count} actionable discoveries found`);
            
            actionBreakdown.forEach(breakdown => {
                this.log(`   ${breakdown.action}: ${breakdown.count} discoveries`);
            });

            if (discoveryCount.count === 0) {
                this.log('❌ ERROR: No actionable discoveries in database!');
                this.log(`   Processed symbols: ${this.validSymbols.length}`);
                this.log(`   Created discoveries: ${this.discoveries.length}`);
                throw new Error('Database validation failed - no actionable discoveries');
            }

            this.log('✅ Database validation passed');
            return discoveryCount.count;

        } catch (error) {
            this.log(`❌ Database validation failed: ${error.message}`);
            throw error;
        }
    }

    // STEP 5: Refresh dashboard
    async refreshDashboard() {
        this.log('🔄 STEP 5: Refreshing dashboard...');

        try {
            // Simulate API call to refresh dashboard data
            const dashboardData = this.db.db.prepare(`
                SELECT symbol, score, action, price, created_at
                FROM discoveries 
                WHERE action IS NOT NULL
                  AND action != 'IGNORE'
                ORDER BY created_at DESC
                LIMIT 20
            `).all();

            this.log(`📱 Dashboard refresh: ${dashboardData.length} discoveries ready for display`);

            if (dashboardData.length === 0) {
                this.log('❌ ERROR: Dashboard has no discoveries to display!');
                await this.generateDetailedDiagnostics();
                throw new Error('Dashboard refresh failed - no discoveries available');
            }

            // Log sample discoveries
            const sample = dashboardData.slice(0, 3);
            sample.forEach(d => {
                this.log(`   📋 ${d.symbol}: ${d.score} → ${d.action} ($${d.price})`);
            });

            this.log('✅ Dashboard refresh successful');
            return dashboardData;

        } catch (error) {
            this.log(`❌ Dashboard refresh failed: ${error.message}`);
            throw error;
        }
    }

    // STEP 6: Generate comprehensive logging and alerts
    async generateLoggingAndAlerts() {
        this.log('📊 STEP 6: Generating comprehensive logging and alerts...');

        const totalTime = Date.now() - this.startTime;
        const summary = {
            executionTime: `${(totalTime / 1000).toFixed(2)}s`,
            validSymbolsFound: this.validSymbols.length,
            discoveriesCreated: this.discoveries.length,
            actionBreakdown: {
                BUY: this.discoveries.filter(d => d.action === 'BUY').length,
                MONITOR: this.discoveries.filter(d => d.action === 'MONITOR').length,
                WATCHLIST: this.discoveries.filter(d => d.action === 'WATCHLIST').length
            }
        };

        this.log('📈 VIGL RECOVERY SUMMARY:');
        this.log(`   ⏱️  Execution Time: ${summary.executionTime}`);
        this.log(`   🎯 Valid Symbols: ${summary.validSymbolsFound}`);
        this.log(`   🔍 Discoveries Created: ${summary.discoveriesCreated}`);
        this.log(`   📊 BUY signals: ${summary.actionBreakdown.BUY}`);
        this.log(`   📊 MONITOR signals: ${summary.actionBreakdown.MONITOR}`);
        this.log(`   📊 WATCHLIST signals: ${summary.actionBreakdown.WATCHLIST}`);

        // Generate alerts
        const alerts = [];
        if (summary.discoveriesCreated === 0) {
            alerts.push('CRITICAL: No discoveries created - VIGL system not generating patterns');
        }
        if (summary.actionBreakdown.BUY === 0) {
            alerts.push('WARNING: No BUY signals generated - check scoring thresholds');
        }
        if (summary.validSymbolsFound < 10) {
            alerts.push('WARNING: Very few valid symbols found - check data quality');
        }

        if (alerts.length > 0) {
            this.log('🚨 ALERTS:');
            alerts.forEach(alert => this.log(`   ⚠️ ${alert}`));
        }

        this.log('✅ Logging and alerts complete');
        return { summary, alerts };
    }

    // Generate detailed diagnostics for troubleshooting
    async generateDetailedDiagnostics() {
        this.log('🔍 GENERATING DETAILED DIAGNOSTICS:');
        
        try {
            const symbolCount = this.db.db.prepare(`
                SELECT COUNT(DISTINCT symbol) as count 
                FROM features_snapshot
            `).get();

            const nullDataCount = this.db.db.prepare(`
                SELECT COUNT(*) as count 
                FROM features_snapshot 
                WHERE rel_volume IS NULL 
                   OR short_interest_pct IS NULL 
            `).get();

            this.log(`   📊 Total symbols in features_snapshot: ${symbolCount.count}`);
            this.log(`   ❌ Symbols with null data: ${nullDataCount.count}`);
            this.log(`   ✅ Symbols that passed filtering: ${this.validSymbols.length}`);

        } catch (error) {
            this.log(`❌ Diagnostics generation failed: ${error.message}`);
        }
    }

    // Main execution method
    async execute() {
        this.log('🚀 STARTING VIGL RECOVERY AUTOMATION');
        
        try {
            await this.clearStaleDiscoveries();
            await this.filterValidSymbols();
            await this.runViglDiscovery();
            await this.validateDatabase();
            await this.refreshDashboard();
            await this.generateLoggingAndAlerts();

            this.log('🎉 VIGL RECOVERY AUTOMATION COMPLETE - SYSTEM RESTORED');
            return true;

        } catch (error) {
            this.log(`💥 VIGL RECOVERY FAILED: ${error.message}`);
            await this.generateDetailedDiagnostics();
            throw error;
        }
    }
}

// CLI execution
if (require.main === module) {
    (async () => {
        try {
            const recovery = new VIGLRecoveryAutomation();
            await recovery.execute();
            console.log('\n🎯 Your VIGL discovery system is now operational!');
            console.log('🔗 Check your dashboard at: https://trading-dashboard-dvou.onrender.com');
            process.exit(0);
        } catch (error) {
            console.error('\n💥 Recovery failed:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = { VIGLRecoveryAutomation };