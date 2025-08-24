#!/usr/bin/env node
/**
 * Portfolio Manager Worker Service
 * Handles all background processing, Python screeners, and scheduled tasks
 */

// Load environment variables
require('dotenv').config();

// Ensure this runs as worker service
if (process.env.DIRECT_WORKER_ENABLED !== 'true') {
  console.error('❌ FATAL: worker.js requires DIRECT_WORKER_ENABLED=true');
  process.exit(1);
}

console.log('🚀 Portfolio Manager Worker Service Starting...');
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  DIRECT_WORKER_ENABLED: process.env.DIRECT_WORKER_ENABLED,
  USE_POSTGRES: process.env.USE_POSTGRES,
  DISABLE_V2: process.env.DISABLE_V2,
  DISABLE_ALPHASTACK_BG: process.env.DISABLE_ALPHASTACK_BG,
  HAS_DATABASE_URL: !!process.env.DATABASE_URL,
  HAS_POLYGON_KEY: !!process.env.POLYGON_API_KEY,
  HAS_ALPACA_KEYS: !!(process.env.APCA_API_KEY_ID && process.env.APCA_API_SECRET_KEY)
});

// Load main server (all workers will be enabled due to DIRECT_WORKER_ENABLED=true)
require('./server.js');

console.log('✅ Portfolio Manager Worker Service initialized');

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Worker service received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Worker service received SIGINT, shutting down gracefully...');
  process.exit(0);
});