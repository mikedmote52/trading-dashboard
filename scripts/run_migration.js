#!/usr/bin/env node
/**
 * Production migration runner
 * Sets up environment and runs the migration
 */

require('dotenv').config();

async function runMigration() {
  console.log('🚀 Starting Production Migration');
  console.log('================================\n');
  
  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not found');
    console.log('💡 This script should be run in production environment with DATABASE_URL set');
    process.exit(1);
  }
  
  console.log('✅ DATABASE_URL found');
  console.log(`🔗 Target: ${process.env.DATABASE_URL.replace(/:([^@]+)@/, ':****@')}\n`);
  
  // Import and run the migration
  console.log('📋 Starting SQLite → Postgres migration...\n');
  
  try {
    require('./migrate_sqlite_to_pg.js');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { runMigration };