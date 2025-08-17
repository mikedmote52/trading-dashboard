/**
 * Simple Data Backup for Trading Intelligence
 * Minimal addition to save key data points without overcomplicating
 */

const fs = require('fs');
const path = require('path');

function saveSimpleBackup(dashboardData) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const timestamp = new Date().toISOString();
        
        // Simple backup object with key data
        const backup = {
            timestamp,
            date: today,
            portfolio_value: dashboardData.portfolio?.totalValue || 0,
            daily_pnl: dashboardData.portfolio?.dailyPnL || 0,
            position_count: dashboardData.portfolio?.positions?.length || 0,
            vigl_discoveries: dashboardData.discoveries?.length || 0,
            high_confidence_vigl: dashboardData.discoveries?.filter(d => d.confidence > 0.85)?.length || 0,
            alerts_count: dashboardData.alerts?.length || 0,
            high_priority_alerts: dashboardData.alerts?.filter(a => a.severity === 'HIGH')?.length || 0
        };
        
        // Save to simple daily file
        const filename = `trading_backup_${today}.json`;
        
        // Append to daily file (don't overwrite)
        let dailyBackups = [];
        try {
            if (fs.existsSync(filename)) {
                const existing = fs.readFileSync(filename, 'utf8');
                const parsed = JSON.parse(existing || '[]');
                dailyBackups = Array.isArray(parsed) ? parsed : []; // guard against non-array
            }
        } catch (e) {
            console.warn(`Backup parse failed, starting fresh []: ${e.message}`);
            dailyBackups = [];
        }
        
        dailyBackups.push(backup);
        
        // Keep only last 24 hours of backups per day
        if (dailyBackups.length > 24) {
            dailyBackups = dailyBackups.slice(-24);
        }
        
        fs.writeFileSync(filename, JSON.stringify(dailyBackups, null, 2));
        
        console.log(`💾 Simple backup saved: ${filename}`);
        
    } catch (error) {
        console.log(`Backup error (non-critical): ${error.message}`);
    }
}

module.exports = { saveSimpleBackup };