#!/usr/bin/env node
/**
 * Check database state for VIGL discoveries
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkDatabase() {
    const dbPath = path.join(__dirname, 'trading_dashboard.db');
    console.log(`🔍 Checking database: ${dbPath}`);
    
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Database connection error:', err.message);
            return;
        }
    });

    // Check total discoveries
    db.get("SELECT COUNT(*) as count FROM discoveries", [], (err, row) => {
        if (err) {
            console.error('❌ Error counting discoveries:', err.message);
        } else {
            console.log(`📊 Total discoveries: ${row.count}`);
        }
    });

    // Check for our VIGL symbols
    db.all("SELECT symbol, score, created_at FROM discoveries WHERE symbol IN ('MRM','SPRU','ORIS','HRTX','BTAI') ORDER BY score DESC", [], (err, rows) => {
        if (err) {
            console.error('❌ Error finding VIGL symbols:', err.message);
        } else {
            console.log(`🎯 VIGL discoveries found: ${rows.length}`);
            rows.forEach(row => {
                console.log(`   • ${row.symbol}: ${row.score} (${row.created_at})`);
            });
        }
    });

    // Check top discoveries by score
    db.all("SELECT symbol, score, created_at FROM discoveries ORDER BY score DESC LIMIT 10", [], (err, rows) => {
        if (err) {
            console.error('❌ Error getting top discoveries:', err.message);
        } else {
            console.log(`📈 Top 10 discoveries by score:`);
            rows.forEach((row, i) => {
                console.log(`   ${i+1}. ${row.symbol}: ${row.score} (${row.created_at})`);
            });
        }
        
        db.close((err) => {
            if (err) {
                console.error('❌ Database close error:', err.message);
            }
        });
    });
}

checkDatabase();