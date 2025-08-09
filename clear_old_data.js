#!/usr/bin/env node
/**
 * Clear old discoveries and trigger fresh scan
 */

const { db } = require('./server/db/sqlite');

console.log('🧹 Clearing old discovery data...');

try {
  // Clear old discoveries
  const result = db.prepare('DELETE FROM discoveries WHERE created_at < datetime("now", "-1 day")').run();
  console.log(`✅ Cleared ${result.changes} old discoveries`);
  
  // Clear old VIGL discoveries too
  const viglResult = db.prepare('DELETE FROM vigl_discoveries WHERE discovered_at < datetime("now", "-1 day")').run();
  console.log(`✅ Cleared ${viglResult.changes} old VIGL discoveries`);
  
  console.log('🎯 Old data cleared - new scans will show fresh results');
  
} catch (error) {
  console.error('❌ Error clearing data:', error.message);
  process.exit(1);
}