#!/usr/bin/env node

/**
 * Deployment Readiness Verification Script
 * Ensures all systems are working before deployment
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🚀 Trading Dashboard - Deployment Readiness Check');
console.log('='.repeat(50));

const checks = [];

// Check 1: Required files exist
function checkRequiredFiles() {
  const requiredFiles = [
    'package.json',
    'server.js', 
    'requirements.txt',
    'agents/universe_screener.py',
    'server/routes/alphastack.js',
    'public/js/alphastack-screener.js',
    'public/index.html'
  ];
  
  const missing = requiredFiles.filter(file => !fs.existsSync(file));
  
  if (missing.length === 0) {
    console.log('✅ All required files present');
    return true;
  } else {
    console.log('❌ Missing required files:', missing);
    return false;
  }
}

// Check 2: Environment variables
function checkEnvironmentVars() {
  const required = ['POLYGON_API_KEY', 'APCA_API_KEY_ID', 'APCA_API_SECRET_KEY'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length === 0) {
    console.log('✅ All required environment variables set');
    return true;
  } else {
    console.log('❌ Missing environment variables:', missing);
    return false;
  }
}

// Check 3: Dependencies
function checkDependencies() {
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const nodeModulesExists = fs.existsSync('node_modules');
    
    if (nodeModulesExists) {
      console.log('✅ Node.js dependencies installed');
      return true;
    } else {
      console.log('❌ Node modules not installed - run npm install');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking dependencies:', error.message);
    return false;
  }
}

// Check 4: Python dependencies
function checkPythonDeps() {
  return new Promise((resolve) => {
    const python = spawn('python3', ['-c', 'import pandas, numpy, pyarrow; print("OK")']);
    
    python.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Python dependencies available');
        resolve(true);
      } else {
        console.log('❌ Python dependencies missing - run pip install -r requirements.txt');
        resolve(false);
      }
    });
    
    python.on('error', () => {
      console.log('❌ Python3 not available');
      resolve(false);
    });
  });
}

// Check 5: Database
function checkDatabase() {
  const dbExists = fs.existsSync('trading_dashboard.db');
  if (dbExists) {
    console.log('✅ SQLite database exists');
    return true;
  } else {
    console.log('⚠️ SQLite database will be created on first run');
    return true; // Not critical
  }
}

// Check 6: API endpoints
function checkAPIEndpoints() {
  try {
    const serverJs = fs.readFileSync('server.js', 'utf8');
    const hasAlphaStack = serverJs.includes('/api/alphastack');
    const hasDashboard = serverJs.includes('/api/dashboard');
    
    if (hasAlphaStack && hasDashboard) {
      console.log('✅ Required API endpoints configured');
      return true;
    } else {
      console.log('❌ Missing API endpoint configuration');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking API endpoints:', error.message);
    return false;
  }
}

// Run all checks
async function runDeploymentCheck() {
  console.log('\n📋 Running deployment checks...\n');
  
  const results = [
    checkRequiredFiles(),
    checkEnvironmentVars(),
    checkDependencies(),
    await checkPythonDeps(),
    checkDatabase(),
    checkAPIEndpoints()
  ];
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Deployment Check Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 DEPLOYMENT READY - All checks passed!');
    console.log('✅ Safe to deploy to production');
    process.exit(0);
  } else {
    console.log('⚠️ DEPLOYMENT BLOCKED - Fix issues above before deploying');
    process.exit(1);
  }
}

runDeploymentCheck().catch(console.error);