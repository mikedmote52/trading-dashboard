#!/usr/bin/env node
/**
 * Environment Variable Validation and Loading Module
 * CRITICAL: Validates all required API keys and prevents startup with missing credentials
 */

const fs = require('fs');
const path = require('path');

/**
 * Required environment variables for the trading system
 */
const REQUIRED_VARS = {
  // Alpaca API - MUST use exact APCA_ prefix
  ALPACA: [
    'APCA_API_KEY_ID',
    'APCA_API_SECRET_KEY'
  ],
  
  // Market Data APIs
  POLYGON: [
    'POLYGON_API_KEY'
  ],
  
  // Database (optional - has default)
  DATABASE: [
    // SQLITE_DB_PATH is optional, defaults to './trading_dashboard.db'
  ]
};

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_VARS = {
  'APCA_API_BASE_URL': 'https://paper-api.alpaca.markets',
  'NODE_ENV': 'development',
  'PORT': '3000',
  'SQLITE_DB_PATH': './trading_dashboard.db'
};

/**
 * Validates a single environment variable
 */
function validateVariable(name, value, category) {
  if (!value || value.trim() === '') {
    return {
      name,
      category,
      status: 'MISSING',
      error: `${name} is required but not set`,
      length: 0
    };
  }
  
  // Check for placeholder values
  const placeholders = ['your_', 'YOUR_', 'placeholder', 'PLACEHOLDER', 'changeme'];
  const isPlaceholder = placeholders.some(p => value.toLowerCase().includes(p.toLowerCase()));
  
  if (isPlaceholder) {
    return {
      name,
      category,
      status: 'PLACEHOLDER',
      error: `${name} contains placeholder value: ${value.substring(0, 10)}...`,
      length: value.length
    };
  }
  
  // Validate minimum lengths for API keys
  const minLengths = {
    'APCA_API_KEY_ID': 20,
    'APCA_API_SECRET_KEY': 30,
    'POLYGON_API_KEY': 15
  };
  
  const minLength = minLengths[name];
  if (minLength && value.length < minLength) {
    return {
      name,
      category,
      status: 'INVALID',
      error: `${name} too short (${value.length} chars, minimum ${minLength})`,
      length: value.length
    };
  }
  
  return {
    name,
    category,
    status: 'VALID',
    error: null,
    length: value.length
  };
}

/**
 * Validates all environment variables
 */
function validateEnvironment() {
  const results = {
    valid: [],
    invalid: [],
    missing: [],
    warnings: [],
    errors: []
  };
  
  // Check required variables
  for (const [category, vars] of Object.entries(REQUIRED_VARS)) {
    for (const varName of vars) {
      const value = process.env[varName];
      const validation = validateVariable(varName, value, category);
      
      if (validation.status === 'VALID') {
        results.valid.push(validation);
      } else if (validation.status === 'MISSING') {
        results.missing.push(validation);
        results.errors.push(`❌ CRITICAL: ${validation.error}`);
      } else {
        results.invalid.push(validation);
        results.errors.push(`❌ INVALID: ${validation.error}`);
      }
    }
  }
  
  // Set optional variables with defaults
  for (const [varName, defaultValue] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
      results.warnings.push(`⚠️  Set ${varName}=${defaultValue} (default)`);
    }
  }
  
  return results;
}

/**
 * Loads environment from .env file if it exists
 */
function loadEnvironmentFile() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../env')
  ];
  
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      console.log(`📁 Loading environment from: ${envPath}`);
      
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        for (const line of lines) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {  // Don't override existing env vars
              process.env[key] = value;
            }
          }
        }
        
        console.log(`✅ Loaded environment variables from ${envPath}`);
        return true;
      } catch (error) {
        console.warn(`⚠️  Could not load ${envPath}: ${error.message}`);
      }
    }
  }
  
  return false;
}

/**
 * Prints validation results
 */
function printValidationResults(results) {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 ENVIRONMENT VARIABLE VALIDATION RESULTS');
  console.log('='.repeat(70));
  
  if (results.valid.length > 0) {
    console.log('\n✅ VALID VARIABLES:');
    results.valid.forEach(v => {
      console.log(`   • ${v.name}: ✅ (${v.length} chars) [${v.category}]`);
    });
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(w => console.log(`   ${w}`));
  }
  
  if (results.invalid.length > 0) {
    console.log('\n❌ INVALID VARIABLES:');
    results.invalid.forEach(v => {
      console.log(`   • ${v.name}: ${v.status} - ${v.error} [${v.category}]`);
    });
  }
  
  if (results.missing.length > 0) {
    console.log('\n💥 MISSING CRITICAL VARIABLES:');
    results.missing.forEach(v => {
      console.log(`   • ${v.name}: REQUIRED for ${v.category} functionality`);
    });
  }
  
  if (results.errors.length > 0) {
    console.log('\n🚨 CRITICAL ERRORS:');
    results.errors.forEach(e => console.log(`   ${e}`));
  }
  
  console.log('\n' + '='.repeat(70));
  
  const hasErrors = results.missing.length > 0 || results.invalid.length > 0;
  if (hasErrors) {
    console.log('❌ ENVIRONMENT VALIDATION FAILED');
    console.log('🔧 Fix these issues before starting the server');
  } else {
    console.log('✅ ENVIRONMENT VALIDATION PASSED');
    console.log('🚀 All required API keys and configuration present');
  }
  console.log('='.repeat(70));
  
  return !hasErrors;
}

/**
 * Main validation function
 */
function validateAndLoadEnvironment(options = {}) {
  const { exitOnFailure = true, loadEnvFile = true } = options;
  
  console.log('🔧 Starting environment validation...');
  
  // Load .env file if requested
  if (loadEnvFile) {
    loadEnvironmentFile();
  }
  
  // Validate all variables
  const results = validateEnvironment();
  const success = printValidationResults(results);
  
  if (!success && exitOnFailure) {
    console.error('\n💥 STARTUP BLOCKED: Environment validation failed');
    console.error('🔧 Set missing environment variables and restart');
    process.exit(1);
  }
  
  return {
    success,
    results
  };
}

/**
 * Express middleware for environment validation
 */
function createEnvironmentMiddleware() {
  return (req, res, next) => {
    const validation = validateAndLoadEnvironment({ exitOnFailure: false });
    
    if (!validation.success) {
      return res.status(500).json({
        error: 'ENVIRONMENT_VALIDATION_FAILED',
        message: 'Server configuration is invalid',
        missing: validation.results.missing.map(v => v.name),
        invalid: validation.results.invalid.map(v => v.name)
      });
    }
    
    next();
  };
}

// Auto-validate if this file is run directly
if (require.main === module) {
  validateAndLoadEnvironment();
}

module.exports = {
  validateAndLoadEnvironment,
  createEnvironmentMiddleware,
  validateVariable,
  REQUIRED_VARS,
  OPTIONAL_VARS
};