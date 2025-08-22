#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get Git SHA from various sources
let sha = 'unknown';
try {
  // Try Render env var first
  sha = process.env.RENDER_GIT_COMMIT || 
        process.env.VERCEL_GIT_COMMIT_SHA || 
        process.env.GIT_COMMIT ||
        execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  console.warn('Could not determine Git SHA:', e.message);
}

const meta = {
  sha: sha.substring(0, 7), // Short SHA
  fullSha: sha,
  builtAt: new Date().toISOString(),
  schemaVersion: 1,
  nodeVersion: process.version,
  platform: process.platform
};

const metaPath = path.join(process.cwd(), 'build_meta.json');
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

console.log('✅ WROTE build_meta.json:', meta);