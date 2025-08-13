#!/usr/bin/env node
/**
 * Fix VIGL Actions - Update NULL actions based on score ranges
 */

const path = require('path');

async function fixViglActions() {
    console.log('🔧 Starting VIGL Actions Fix...\n');
    
    try {
        // Initialize database
        const db = require('./server/db/sqlite');
        
        // Get all discoveries with NULL actions
        const nullActionRecords = db.db.prepare(`
            SELECT id, symbol, score, action 
            FROM discoveries 
            WHERE action IS NULL OR action = ''
            ORDER BY created_at DESC
        `).all();
        
        console.log(`📊 Found ${nullActionRecords.length} records with NULL actions`);
        
        if (nullActionRecords.length === 0) {
            console.log('✅ No NULL actions to fix');
            return;
        }
        
        // Update actions based on score ranges
        const updateStmt = db.db.prepare('UPDATE discoveries SET action = ? WHERE id = ?');
        let updated = 0;
        
        for (const record of nullActionRecords) {
            let action;
            const score = record.score || 0;
            
            // ActionMapper logic
            if (score > 7.0) {
                action = 'BUY';
            } else if (score >= 2.0) {
                action = 'MONITOR';
            } else if (score >= 1.0) {
                action = 'WATCHLIST';
            } else {
                action = 'IGNORE';
            }
            
            updateStmt.run(action, record.id);
            updated++;
            console.log(`✅ ${record.symbol}: ${score} → ${action}`);
        }
        
        console.log(`\n📊 Updated ${updated} records with proper actions`);
        
        // Verify the fixes
        const actionCounts = db.db.prepare(`
            SELECT action, COUNT(*) as count 
            FROM discoveries 
            GROUP BY action
            ORDER BY count DESC
        `).all();
        
        console.log('\n📈 Action Distribution:');
        actionCounts.forEach(row => {
            console.log(`   ${row.action || 'NULL'}: ${row.count}`);
        });
        
        // Show recent BUY actions
        const recentBuys = db.db.prepare(`
            SELECT symbol, score, action, created_at
            FROM discoveries 
            WHERE action = 'BUY'
            ORDER BY created_at DESC
            LIMIT 5
        `).all();
        
        if (recentBuys.length > 0) {
            console.log('\n🎯 Recent BUY Actions:');
            recentBuys.forEach(record => {
                console.log(`   ${record.symbol}: ${record.score} (${new Date(record.created_at).toLocaleDateString()})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Fix failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    fixViglActions().then(() => {
        console.log('\n✅ VIGL Actions Fix Complete');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Fix failed:', error);
        process.exit(1);
    });
}

module.exports = { fixViglActions };