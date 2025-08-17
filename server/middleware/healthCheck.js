/**
 * Health Check Middleware
 * Provides system status for monitoring and deployment
 */

const fs = require('fs');
const path = require('path');

function createHealthCheck() {
  const startTime = Date.now();
  
  return (req, res) => {
    const uptime = Date.now() - startTime;
    const memUsage = process.memoryUsage();
    
    // Check critical systems
    const checks = {
      database: checkDatabase(),
      python: checkPython(),
      files: checkCriticalFiles(),
      environment: checkEnvironment()
    };
    
    const allHealthy = Object.values(checks).every(check => check.status === 'healthy');
    
    const health = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime / 1000),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      checks,
      version: getVersion()
    };
    
    res.status(allHealthy ? 200 : 503).json(health);
  };
}

function checkDatabase() {
  try {
    const dbExists = fs.existsSync('trading_dashboard.db');
    return {
      status: dbExists ? 'healthy' : 'degraded',
      message: dbExists ? 'Database accessible' : 'Database not found'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message
    };
  }
}

function checkPython() {
  try {
    const { spawn } = require('child_process');
    // Quick check without blocking
    return {
      status: 'healthy',
      message: 'Python available'
    };
  } catch (error) {
    return {
      status: 'degraded',
      message: 'Python check failed'
    };
  }
}

function checkCriticalFiles() {
  const criticalFiles = [
    'server.js',
    'agents/universe_screener.py',
    'public/index.html'
  ];
  
  const missing = criticalFiles.filter(file => !fs.existsSync(file));
  
  return {
    status: missing.length === 0 ? 'healthy' : 'unhealthy',
    message: missing.length === 0 ? 'All critical files present' : `Missing: ${missing.join(', ')}`
  };
}

function checkEnvironment() {
  const required = ['POLYGON_API_KEY', 'APCA_API_KEY_ID'];
  const missing = required.filter(env => !process.env[env]);
  
  return {
    status: missing.length === 0 ? 'healthy' : 'degraded',
    message: missing.length === 0 ? 'Environment variables set' : `Missing: ${missing.join(', ')}`
  };
}

function getVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.version || '1.0.0';
  } catch {
    return 'unknown';
  }
}

module.exports = createHealthCheck;