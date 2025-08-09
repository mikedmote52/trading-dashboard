#!/usr/bin/env node
/**
 * Clear old discoveries and trigger fresh scan
 */

const { db } = require('./server/db/sqlite');

console.log('🧹 Clearing old discovery data...');

try {
  // Clear ALL discoveries for fresh start
  const result = db.prepare('DELETE FROM discoveries').run();
  console.log(`✅ Cleared ${result.changes} discoveries`);
  
  // Clear ALL VIGL discoveries too
  const viglResult = db.prepare('DELETE FROM vigl_discoveries').run();
  console.log(`✅ Cleared ${viglResult.changes} VIGL discoveries`);
  
  // Clear data status to force fresh scan
  const statusResult = db.prepare('DELETE FROM data_status').run();
  console.log(`✅ Cleared ${statusResult.changes} data status entries`);
  
  console.log('🎯 All data cleared - ready for fresh scans');
  
} catch (error) {
  console.error('❌ Error clearing data:', error.message);
  process.exit(1);
}