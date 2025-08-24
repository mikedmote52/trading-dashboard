/**
 * VIGL Connection Diagnostic Tool
 * Comprehensive troubleshooting and health checks for VIGL integration
 */

const { CompleteVIGLFix } = require('./complete_vigl_fix');
const fs = require('fs');
const path = require('path');

class VIGLConnectionDiagnostic {
  constructor() {
    this.viglFix = null;
    this.diagnosticResults = {};
  }

  /**
   * Run comprehensive diagnostic suite
   */
  async runFullDiagnostic() {
    console.log('🔧 Starting VIGL Connection Diagnostic Suite...\n');
    
    const tests = [
      'checkEnvironmentVariables',
      'checkFileSystem', 
      'checkDatabaseConnection',
      'checkPythonEnvironment',
      'checkVIGLScript',
      'checkPolygonAPI',
      'checkAlpacaAPI',
      'testVIGLConnector',
      'testCompleteIntegration'
    ];

    this.diagnosticResults = {
      timestamp: new Date().toISOString(),
      overallStatus: 'UNKNOWN',
      tests: {}
    };

    let passedTests = 0;
    let totalTests = tests.length;

    for (const testName of tests) {
      try {
        console.log(`\n🧪 Running test: ${testName}`);
        const result = await this[testName]();
        this.diagnosticResults.tests[testName] = result;
        
        if (result.status === 'PASS') {
          passedTests++;
          console.log(`✅ ${testName}: ${result.message}`);
        } else if (result.status === 'WARN') {
          console.log(`⚠️ ${testName}: ${result.message}`);
        } else {
          console.log(`❌ ${testName}: ${result.message}`);
        }
      } catch (error) {
        this.diagnosticResults.tests[testName] = {
          status: 'FAIL',
          message: error.message,
          error: error
        };
        console.log(`❌ ${testName}: ${error.message}`);
      }
    }

    // Determine overall status
    const passRate = passedTests / totalTests;
    if (passRate >= 0.9) {
      this.diagnosticResults.overallStatus = 'HEALTHY';
    } else if (passRate >= 0.7) {
      this.diagnosticResults.overallStatus = 'DEGRADED';
    } else {
      this.diagnosticResults.overallStatus = 'CRITICAL';
    }

    console.log(`\n📊 Diagnostic Summary:`);
    console.log(`   Tests Passed: ${passedTests}/${totalTests}`);
    console.log(`   Overall Status: ${this.diagnosticResults.overallStatus}`);
    console.log(`   Pass Rate: ${(passRate * 100).toFixed(1)}%`);

    return this.diagnosticResults;
  }

  /**
   * Check environment variables
   */
  async checkEnvironmentVariables() {
    const required = ['POLYGON_API_KEY'];
    const optional = ['APCA_API_KEY_ID', 'APCA_API_SECRET_KEY', 'OPENROUTER_API_KEY'];
    
    const missing = required.filter(key => !process.env[key]);
    const optionalPresent = optional.filter(key => !!process.env[key]);
    
    if (missing.length > 0) {
      return {
        status: 'FAIL',
        message: `Missing required environment variables: ${missing.join(', ')}`,
        details: { missing, optionalPresent }
      };
    }

    return {
      status: 'PASS',
      message: `All required environment variables present. Optional: ${optionalPresent.length}/${optional.length}`,
      details: { optionalPresent }
    };
  }

  /**
   * Check file system and paths
   */
  async checkFileSystem() {
    const pathsToCheck = [
      { path: __dirname, name: 'Project root' },
      { path: path.join(__dirname, 'server'), name: 'Server directory' },
      { path: path.join(__dirname, 'server/db'), name: 'Database directory' },
      { path: path.join(__dirname, 'trading_dashboard.db'), name: 'SQLite database' }
    ];

    const issues = [];
    const checks = [];

    for (const check of pathsToCheck) {
      try {
        const exists = fs.existsSync(check.path);
        if (exists) {
          const stats = fs.statSync(check.path);
          checks.push({
            name: check.name,
            path: check.path,
            exists: true,
            readable: true,
            size: stats.isFile() ? stats.size : null
          });
        } else {
          checks.push({
            name: check.name,
            path: check.path,
            exists: false
          });
          issues.push(`${check.name} not found at ${check.path}`);
        }
      } catch (error) {
        checks.push({
          name: check.name,
          path: check.path,
          exists: false,
          error: error.message
        });
        issues.push(`Cannot access ${check.name}: ${error.message}`);
      }
    }

    if (issues.length > 0) {
      return {
        status: 'FAIL',
        message: `File system issues: ${issues.join('; ')}`,
        details: { checks, issues }
      };
    }

    return {
      status: 'PASS',
      message: 'All required paths accessible',
      details: { checks }
    };
  }

  /**
   * Check database connection
   */
  async checkDatabaseConnection() {
    try {
      const dbPath = path.join(__dirname, 'trading_dashboard.db');
      
      if (!fs.existsSync(dbPath)) {
        return {
          status: 'FAIL',
          message: `Database file not found: ${dbPath}`,
          details: { dbPath }
        };
      }

      const db = require('./server/db/sqlite');
      
      // Test basic query
      const testQuery = db.db.prepare('SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"');
      const result = testQuery.get();
      const tableCount = result.count;

      // Check for required tables
      const requiredTables = ['discoveries', 'features_snapshot', 'theses', 'trading_decisions'];
      const existingTables = db.db.prepare(
        'SELECT name FROM sqlite_master WHERE type="table" AND name NOT LIKE "sqlite_%"'
      ).all().map(row => row.name);

      const missingTables = requiredTables.filter(table => !existingTables.includes(table));

      if (missingTables.length > 0) {
        return {
          status: 'WARN',
          message: `Database connected but missing tables: ${missingTables.join(', ')}`,
          details: { tableCount, existingTables, missingTables }
        };
      }

      // Test discoveries table
      const discoveryCount = db.db.prepare('SELECT COUNT(*) as count FROM discoveries').get();

      return {
        status: 'PASS',
        message: `Database healthy: ${tableCount} tables, ${discoveryCount.count} discoveries`,
        details: { 
          tableCount, 
          existingTables, 
          discoveryCount: discoveryCount.count,
          dbPath 
        }
      };

    } catch (error) {
      return {
        status: 'FAIL',
        message: `Database connection failed: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Python environment
   */
  async checkPythonEnvironment() {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      const pythonProcess = spawn('python3', ['--version'], { 
        stdio: ['pipe', 'pipe', 'pipe'] 
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0 || output.includes('Python')) {
          const version = (output + errorOutput).trim();
          resolve({
            status: 'PASS',
            message: `Python available: ${version}`,
            details: { version, code }
          });
        } else {
          resolve({
            status: 'FAIL',
            message: `Python not available or not working (exit code: ${code})`,
            details: { code, output, errorOutput }
          });
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({
          status: 'FAIL',
          message: `Python process error: ${error.message}`,
          details: { error: error.message }
        });
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!pythonProcess.killed) {
          pythonProcess.kill();
          resolve({
            status: 'FAIL',
            message: 'Python version check timed out',
            details: { timeout: true }
          });
        }
      }, 5000);
    });
  }

  /**
   * Check VIGL script availability
   */
  async checkVIGLScript() {
    const possiblePaths = [
      path.join(__dirname, 'VIGL_Discovery_Complete.py'),
      path.join(__dirname, '..', 'VIGL-Discovery', 'VIGL_Discovery_Complete.py'),
      path.join(process.env.HOME || '', 'Desktop', 'Trading-Systems', 'VIGL-Discovery', 'VIGL_Discovery_Complete.py'),
      path.join(process.env.HOME || '', 'Documents', 'Portfolio-Systems', 'VIGL-Discovery', 'VIGL_Discovery_Complete.py')
    ];

    for (const scriptPath of possiblePaths) {
      try {
        if (fs.existsSync(scriptPath)) {
          const stats = fs.statSync(scriptPath);
          return {
            status: 'PASS',
            message: `VIGL script found: ${scriptPath} (${stats.size} bytes)`,
            details: { scriptPath, size: stats.size }
          };
        }
      } catch (error) {
        // Continue searching
      }
    }

    return {
      status: 'FAIL',
      message: 'VIGL Discovery script not found in standard locations',
      details: { searchedPaths: possiblePaths }
    };
  }

  /**
   * Check Polygon API connectivity
   */
  async checkPolygonAPI() {
    if (!process.env.POLYGON_API_KEY) {
      return {
        status: 'FAIL',
        message: 'POLYGON_API_KEY not configured',
        details: {}
      };
    }

    return new Promise((resolve) => {
      const https = require('https');
      
      const options = {
        hostname: 'api.polygon.io',
        path: `/v2/aggs/ticker/AAPL/prev?apikey=${process.env.POLYGON_API_KEY}`,
        method: 'GET',
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            
            if (res.statusCode === 200 && parsed.status === 'OK') {
              resolve({
                status: 'PASS',
                message: 'Polygon API working correctly',
                details: { statusCode: res.statusCode, status: parsed.status }
              });
            } else if (res.statusCode === 401) {
              resolve({
                status: 'FAIL',
                message: 'Polygon API key invalid or expired',
                details: { statusCode: res.statusCode, data }
              });
            } else {
              resolve({
                status: 'WARN',
                message: `Polygon API responded with status ${res.statusCode}`,
                details: { statusCode: res.statusCode, data }
              });
            }
          } catch (error) {
            resolve({
              status: 'FAIL',
              message: `Polygon API response parse error: ${error.message}`,
              details: { statusCode: res.statusCode, data: data.substring(0, 200) }
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          status: 'FAIL',
          message: `Polygon API connection error: ${error.message}`,
          details: { error: error.message }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 'FAIL',
          message: 'Polygon API request timed out',
          details: { timeout: true }
        });
      });

      req.end();
    });
  }

  /**
   * Check Alpaca API connectivity
   */
  async checkAlpacaAPI() {
    if (!process.env.APCA_API_KEY_ID || !process.env.APCA_API_SECRET_KEY) {
      return {
        status: 'WARN',
        message: 'Alpaca API keys not configured (optional for VIGL discovery)',
        details: { 
          hasApiKey: !!process.env.APCA_API_KEY_ID,
          hasSecretKey: !!process.env.APCA_API_SECRET_KEY
        }
      };
    }

    return new Promise((resolve) => {
      const https = require('https');
      const baseUrl = process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets';
      const url = new URL(baseUrl);
      
      const options = {
        hostname: url.hostname,
        path: '/v2/account',
        method: 'GET',
        headers: {
          'APCA-API-KEY-ID': process.env.APCA_API_KEY_ID,
          'APCA-API-SECRET-KEY': process.env.APCA_API_SECRET_KEY
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({
              status: 'PASS',
              message: 'Alpaca API working correctly',
              details: { statusCode: res.statusCode }
            });
          } else if (res.statusCode === 403) {
            resolve({
              status: 'FAIL',
              message: 'Alpaca API credentials invalid',
              details: { statusCode: res.statusCode }
            });
          } else {
            resolve({
              status: 'WARN',
              message: `Alpaca API responded with status ${res.statusCode}`,
              details: { statusCode: res.statusCode, data: data.substring(0, 200) }
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          status: 'FAIL',
          message: `Alpaca API connection error: ${error.message}`,
          details: { error: error.message }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 'FAIL',
          message: 'Alpaca API request timed out',
          details: { timeout: true }
        });
      });

      req.end();
    });
  }

  /**
   * Test VIGL connector functionality
   */
  async testVIGLConnector() {
    try {
      if (!this.viglFix) {
        this.viglFix = new CompleteVIGLFix();
      }

      const status = await this.viglFix.getDiscoveryStatus();
      
      // Basic status check
      if (status.environment && status.environment.hasPolygonKey) {
        return {
          status: 'PASS',
          message: 'VIGL connector initialized successfully',
          details: status
        };
      } else {
        return {
          status: 'FAIL',
          message: 'VIGL connector missing required configuration',
          details: status
        };
      }

    } catch (error) {
      return {
        status: 'FAIL',
        message: `VIGL connector test failed: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Test complete integration
   */
  async testCompleteIntegration() {
    try {
      if (!this.viglFix) {
        this.viglFix = new CompleteVIGLFix();
      }

      const integrationTest = await this.viglFix.testSystemIntegration();
      
      if (integrationTest.overall) {
        return {
          status: 'PASS',
          message: 'Complete integration test passed',
          details: integrationTest
        };
      } else {
        return {
          status: 'FAIL',
          message: 'Integration test failed - see details for specific failures',
          details: integrationTest
        };
      }

    } catch (error) {
      return {
        status: 'FAIL',
        message: `Integration test error: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Generate diagnostic report
   */
  generateReport() {
    if (!this.diagnosticResults.timestamp) {
      return 'No diagnostic results available. Run runFullDiagnostic() first.';
    }

    let report = `
VIGL Connection Diagnostic Report
Generated: ${this.diagnosticResults.timestamp}
Overall Status: ${this.diagnosticResults.overallStatus}

Test Results:
=============
`;

    for (const [testName, result] of Object.entries(this.diagnosticResults.tests)) {
      const statusIcon = result.status === 'PASS' ? '✅' : 
                        result.status === 'WARN' ? '⚠️' : '❌';
      
      report += `
${statusIcon} ${testName}: ${result.status}
   ${result.message}`;
      
      if (result.details && Object.keys(result.details).length > 0) {
        report += `\n   Details: ${JSON.stringify(result.details, null, 6)}`;
      }
    }

    report += `

Recommendations:
===============`;

    if (this.diagnosticResults.overallStatus === 'CRITICAL') {
      report += `
❌ CRITICAL ISSUES DETECTED:
   1. Review failed tests above
   2. Ensure all required environment variables are set
   3. Verify Python and VIGL script availability
   4. Check API key configurations`;
    } else if (this.diagnosticResults.overallStatus === 'DEGRADED') {
      report += `
⚠️ SYSTEM PARTIALLY FUNCTIONAL:
   1. Review warning messages above
   2. Consider fixing non-critical issues for optimal performance
   3. Monitor system behavior during operation`;
    } else {
      report += `
✅ SYSTEM HEALTHY:
   All critical tests passed. VIGL discovery system ready for operation.`;
    }

    return report;
  }

  /**
   * Quick health check
   */
  async quickHealthCheck() {
    const essential = [
      'checkEnvironmentVariables',
      'checkDatabaseConnection', 
      'checkPythonEnvironment'
    ];

    console.log('⚡ Running quick health check...');
    let healthy = true;
    const issues = [];

    for (const test of essential) {
      try {
        const result = await this[test]();
        if (result.status === 'FAIL') {
          healthy = false;
          issues.push(`${test}: ${result.message}`);
        }
      } catch (error) {
        healthy = false;
        issues.push(`${test}: ${error.message}`);
      }
    }

    return {
      healthy,
      issues,
      message: healthy ? 'System ready for VIGL discovery' : `Issues found: ${issues.length}`
    };
  }
}

// CLI interface for running diagnostics
if (require.main === module) {
  (async () => {
    const diagnostic = new VIGLConnectionDiagnostic();
    
    const args = process.argv.slice(2);
    
    if (args.includes('--quick')) {
      const result = await diagnostic.quickHealthCheck();
      console.log(result.healthy ? '✅ Quick check passed' : '❌ Quick check failed');
      if (!result.healthy) {
        result.issues.forEach(issue => console.log(`  - ${issue}`));
      }
    } else {
      await diagnostic.runFullDiagnostic();
      console.log('\n' + diagnostic.generateReport());
    }
    
    process.exit(0);
  })().catch(error => {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  });
}

module.exports = { VIGLConnectionDiagnostic };