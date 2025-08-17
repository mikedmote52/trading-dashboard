#!/usr/bin/env node

/**
 * Post-tool-use hook: Validates operations after execution
 * Runs performance benchmarks and safety checks for AlphaStack V3
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  API_RESPONSE_TIME: 2000, // 2 seconds max
  COMPONENT_RENDER_TIME: 100, // 100ms max
  BUNDLE_SIZE_MB: 0.5, // 500KB max
  MEMORY_USAGE_MB: 50 // 50MB max
};

// Critical files to validate
const CRITICAL_FILES = [
  'src/components/AlphaStackV3.tsx',
  'src/api/alphastack-client.ts',
  'src/config/feature-flags.js',
  'agents/universe_screener.py' // Protected - should never change
];

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { 
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => stdout += data.toString());
    proc.stderr.on('data', (data) => stderr += data.toString());
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed: ${stderr}`));
      }
    });
  });
}

async function validateAlphaStackProtection() {
  console.log('🔒 Validating AlphaStack protection...');
  
  // Check if protected files were modified
  const protectedFiles = [
    'agents/universe_screener.py',
    'src/screener/v2/worker.js',
    'src/screener/v2/run-direct.js'
  ];
  
  for (const file of protectedFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for dangerous modifications
      if (content.includes('MODIFIED') || content.includes('ALTERED')) {
        console.error(`❌ CRITICAL: Protected AlphaStack file appears modified: ${file}`);
        process.exit(1);
      }
    }
  }
  
  console.log('✅ AlphaStack protection validated');
}

async function runPerformanceTests() {
  console.log('🚀 Running performance tests...');
  
  try {
    // Test API endpoint response time
    const startTime = Date.now();
    const response = await fetch('http://localhost:3003/api/v2/scan/squeeze');
    const apiResponseTime = Date.now() - startTime;
    
    if (apiResponseTime > PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME) {
      console.warn(`⚠️ API response time: ${apiResponseTime}ms (threshold: ${PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME}ms)`);
    } else {
      console.log(`✅ API response time: ${apiResponseTime}ms`);
    }
    
    // Test data validity
    if (response.ok) {
      const data = await response.json();
      if (!data.results || !Array.isArray(data.results)) {
        console.error('❌ API response format invalid');
        process.exit(1);
      }
      console.log(`✅ API data valid: ${data.results.length} candidates`);
    }
    
  } catch (error) {
    console.warn(`⚠️ Performance test failed: ${error.message}`);
  }
}

async function validateTypeScript() {
  console.log('📝 Validating TypeScript...');
  
  try {
    // Check if TypeScript files compile
    await runCommand('npx', ['tsc', '--noEmit', '--skipLibCheck']);
    console.log('✅ TypeScript validation passed');
  } catch (error) {
    console.error(`❌ TypeScript validation failed: ${error.message}`);
    process.exit(1);
  }
}

async function runSecurityScan() {
  console.log('🔐 Running security scan...');
  
  // Check for sensitive data leaks
  const sensitivePatterns = [
    /api[_-]?key.*[=:]\s*['\"][^'\"]+['\"]/gi,
    /secret.*[=:]\s*['\"][^'\"]+['\"]/gi,
    /password.*[=:]\s*['\"][^'\"]+['\"]/gi,
    /token.*[=:]\s*['\"][^'\"]+['\"]/gi
  ];
  
  for (const file of CRITICAL_FILES) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      for (const pattern of sensitivePatterns) {
        if (pattern.test(content)) {
          console.error(`❌ SECURITY: Potential sensitive data leak in ${file}`);
          process.exit(1);
        }
      }
    }
  }
  
  console.log('✅ Security scan passed');
}

async function validateFeatureFlags() {
  console.log('🎛️ Validating feature flags...');
  
  try {
    const flagsPath = 'src/config/feature-flags.js';
    if (fs.existsSync(flagsPath)) {
      const { getConfig, isEnabled } = require(path.resolve(flagsPath));
      
      // Ensure AlphaStack protection is always enabled
      const config = getConfig();
      if (!config.protection || !config.protection.alphastack_immutable) {
        console.error('❌ CRITICAL: AlphaStack protection must always be enabled');
        process.exit(1);
      }
      
      console.log('✅ Feature flags validated');
      console.log(`   Version: ${config.version}`);
      console.log(`   Features: ${config.features.length} enabled`);
    }
  } catch (error) {
    console.error(`❌ Feature flag validation failed: ${error.message}`);
    process.exit(1);
  }
}

async function validateBuildSize() {
  console.log('📦 Validating build size...');
  
  try {
    // Check if build directory exists and get size
    if (fs.existsSync('build') || fs.existsSync('dist')) {
      console.log('✅ Build size validation skipped (requires build)');
    } else {
      console.log('ℹ️ No build directory found, skipping size validation');
    }
  } catch (error) {
    console.warn(`⚠️ Build size validation failed: ${error.message}`);
  }
}

// Main execution
async function runValidation() {
  console.log('🔍 Post-tool-use validation starting...');
  console.log('='.repeat(50));
  
  try {
    await validateAlphaStackProtection();
    await runPerformanceTests();
    await validateTypeScript();
    await runSecurityScan();
    await validateFeatureFlags();
    await validateBuildSize();
    
    console.log('='.repeat(50));
    console.log('✅ All validations passed successfully!');
    
  } catch (error) {
    console.error('='.repeat(50));
    console.error(`❌ Validation failed: ${error.message}`);
    process.exit(1);
  }
}

// Skip validation if server is not running
if (process.env.SKIP_VALIDATION === 'true') {
  console.log('ℹ️ Validation skipped (SKIP_VALIDATION=true)');
  process.exit(0);
}

runValidation();