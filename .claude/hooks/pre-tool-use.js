#!/usr/bin/env node

/**
 * Pre-tool-use hook: Validates operations before execution
 * Enforces AlphaStack protection and safety requirements
 */

const path = require('path');
const fs = require('fs');

// Protected AlphaStack files - NEVER modify these
const PROTECTED_ALPHASTACK_FILES = [
  'agents/universe_screener.py',
  'src/screener/v2/worker.js',
  'src/screener/v2/run-direct.js', 
  'src/screener/v2/cache.js'
];

const PROTECTED_PATTERNS = [
  /agents\/universe_screener\.py/,
  /src\/screener\/v2\/.*/,
  /scoring.*algorithm/i,
  /vigl.*detection/i
];

function validateToolUse(toolName, parameters) {
  console.log(`🔍 Pre-hook: Validating ${toolName} operation...`);
  
  // Check for AlphaStack protection violations
  if (toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write') {
    const filePath = parameters.file_path || parameters.filePath;
    
    if (filePath) {
      // Check against protected files
      const isProtected = PROTECTED_ALPHASTACK_FILES.some(protected => 
        filePath.includes(protected)
      );
      
      if (isProtected) {
        console.error(`❌ BLOCKED: Attempt to modify protected AlphaStack file: ${filePath}`);
        console.error(`   AlphaStack is the core discovery system and must remain immutable`);
        process.exit(1);
      }
      
      // Check against protected patterns
      const hasProtectedPattern = PROTECTED_PATTERNS.some(pattern =>
        pattern.test(filePath)
      );
      
      if (hasProtectedPattern) {
        console.error(`❌ BLOCKED: Attempt to modify AlphaStack-related file: ${filePath}`);
        console.error(`   AlphaStack discovery engine must not be altered`);
        process.exit(1);
      }
      
      // Check file content for dangerous modifications
      if (parameters.old_string || parameters.new_string) {
        const content = (parameters.old_string || '') + (parameters.new_string || '');
        
        if (content.match(/score.*algorithm|discovery.*logic|alphastack.*modify/i)) {
          console.error(`❌ BLOCKED: Attempt to modify AlphaStack algorithms detected`);
          console.error(`   Content: ${content.substring(0, 100)}...`);
          process.exit(1);
        }
      }
    }
  }
  
  // Validate API endpoints for read-only constraint
  if (toolName === 'WebFetch' || (toolName === 'Bash' && parameters.command?.includes('curl'))) {
    const command = parameters.command || parameters.url || '';
    
    if (command.includes('POST') || command.includes('PUT') || command.includes('DELETE')) {
      console.error(`❌ BLOCKED: Non-GET HTTP method detected in: ${command}`);
      console.error(`   Only read-only operations are allowed`);
      process.exit(1);
    }
  }
  
  console.log(`✅ Pre-hook: ${toolName} operation validated`);
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: pre-tool-use.js <toolName> <parametersJson>');
  process.exit(1);
}

const toolName = args[0];
const parameters = JSON.parse(args[1] || '{}');

try {
  validateToolUse(toolName, parameters);
} catch (error) {
  console.error(`❌ Pre-hook validation failed: ${error.message}`);
  process.exit(1);
}