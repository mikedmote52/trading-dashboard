#!/usr/bin/env node

const { execSync } = require('child_process');
const { writeFileSync } = require('fs');

function sh(cmd) { 
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); 
  } catch (e) {
    return 'unknown';
  }
}

const gitSha = process.env.RENDER_GIT_COMMIT || sh("git rev-parse --short=12 HEAD");
const gitBranch = process.env.RENDER_GIT_BRANCH || sh("git rev-parse --abbrev-ref HEAD");
const ts = new Date().toISOString();

const stamp = {
  ts,
  gitSha,
  gitBranch,
  service: process.env.SERVICE_ROLE || "unknown",
  node: process.version,
  buildId: `${gitSha}-${Date.now()}`
};

writeFileSync("./.build-stamp.json", JSON.stringify(stamp, null, 2));
console.log("[build-stamp]", stamp);