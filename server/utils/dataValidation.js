#!/usr/bin/env node
/**
 * Data Validation Module - Prevents placeholder/fake data from entering system
 * CRITICAL: Rejects any records with default or suspicious values
 */

const SUSPICIOUS_VALUES = {
  // Common placeholder prices that indicate fake data
  FAKE_PRICES: [50, 100, 10, 1, 0],
  
  // Suspicious round numbers that are often defaults
  ROUND_NUMBERS: [1000000, 5000000, 10000000, 50000000, 100000000],
  
  // Default sector/industry values
  FAKE_SECTORS: ['Technology', 'Software', 'Unknown', 'N/A'],
  
  // Minimum realistic volume spike for VIGL patterns
  MIN_VOLUME_SPIKE: 1.5,
  
  // Maximum realistic price for penny stocks to avoid obvious fakes
  MAX_REASONABLE_PRICE: 1000
};

class DataValidationError extends Error {
  constructor(message, field, value, symbol) {
    super(message);
    this.name = 'DataValidationError';
    this.field = field;
    this.value = value;
    this.symbol = symbol;
  }
}

/**
 * Validates a discovery record for suspicious/fake data
 * @param {Object} discovery - The discovery record to validate
 * @returns {Object} - Validation result with isValid and errors
 */
function validateDiscovery(discovery) {
  const errors = [];
  const warnings = [];
  const symbol = discovery.symbol || 'UNKNOWN';
  
  try {
    const features = typeof discovery.features_json === 'string' 
      ? JSON.parse(discovery.features_json)
      : discovery.features_json || {};

    // 1. CRITICAL: Check for fake prices
    if (features.current_price) {
      if (SUSPICIOUS_VALUES.FAKE_PRICES.includes(features.current_price)) {
        errors.push(`FAKE PRICE DETECTED: ${symbol} has placeholder price $${features.current_price}`);
      }
      
      if (features.current_price <= 0) {
        errors.push(`INVALID PRICE: ${symbol} has non-positive price $${features.current_price}`);
      }
      
      if (features.current_price > SUSPICIOUS_VALUES.MAX_REASONABLE_PRICE) {
        warnings.push(`HIGH PRICE WARNING: ${symbol} price $${features.current_price} seems unusually high`);
      }
    } else {
      errors.push(`MISSING PRICE: ${symbol} has no current_price field`);
    }

    // 2. CRITICAL: Check for fake volume data
    if (features.volume_spike_factor !== undefined) {
      if (features.volume_spike_factor < SUSPICIOUS_VALUES.MIN_VOLUME_SPIKE) {
        errors.push(`INVALID VOLUME SPIKE: ${symbol} volume spike ${features.volume_spike_factor}x is below VIGL threshold`);
      }
    }

    if (features.volume !== undefined && features.avg_volume_30d !== undefined) {
      if (SUSPICIOUS_VALUES.ROUND_NUMBERS.includes(features.avg_volume_30d)) {
        errors.push(`FAKE VOLUME: ${symbol} has placeholder avg_volume_30d: ${features.avg_volume_30d}`);
      }
    }

    // 3. CRITICAL: Check for fake market cap and share data
    if (features.market_cap && SUSPICIOUS_VALUES.ROUND_NUMBERS.includes(features.market_cap)) {
      errors.push(`FAKE MARKET CAP: ${symbol} has placeholder market_cap: $${features.market_cap}`);
    }

    if (features.float_shares && SUSPICIOUS_VALUES.ROUND_NUMBERS.includes(features.float_shares)) {
      errors.push(`FAKE FLOAT: ${symbol} has placeholder float_shares: ${features.float_shares}`);
    }

    // 4. Check for fake sector/industry data
    if (features.sector && SUSPICIOUS_VALUES.FAKE_SECTORS.includes(features.sector)) {
      warnings.push(`DEFAULT SECTOR: ${symbol} has generic sector: ${features.sector}`);
    }

    // 5. Check for missing critical VIGL fields
    const requiredFields = ['symbol', 'current_price', 'volume_spike_factor', 'vigl_similarity'];
    for (const field of requiredFields) {
      if (features[field] === undefined || features[field] === null) {
        errors.push(`MISSING FIELD: ${symbol} missing required field: ${field}`);
      }
    }

    // 6. Check for identical values across multiple fields (copy-paste errors)
    const numericFields = ['current_price', 'volume', 'avg_volume_30d', 'market_cap', 'float_shares'];
    const values = numericFields.map(field => features[field]).filter(v => v !== undefined);
    const uniqueValues = [...new Set(values)];
    
    if (values.length > 2 && uniqueValues.length === 1) {
      errors.push(`DUPLICATE VALUES: ${symbol} has identical values across multiple fields: ${uniqueValues[0]}`);
    }

    // 7. Validate VIGL similarity score
    if (features.vigl_similarity !== undefined) {
      if (features.vigl_similarity < 0.7) {
        errors.push(`LOW SIMILARITY: ${symbol} VIGL similarity ${features.vigl_similarity} below 70% threshold`);
      }
      if (features.vigl_similarity > 1.0) {
        errors.push(`INVALID SIMILARITY: ${symbol} VIGL similarity ${features.vigl_similarity} exceeds 100%`);
      }
    }

    // 8. Check data freshness
    if (features.timestamp) {
      const dataAge = Date.now() - new Date(features.timestamp).getTime();
      const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
      
      if (dataAge > maxAgeMs) {
        warnings.push(`STALE DATA: ${symbol} data is ${Math.round(dataAge / (60 * 60 * 1000))} hours old`);
      }
    }

  } catch (parseError) {
    errors.push(`JSON PARSE ERROR: ${symbol} features_json is invalid: ${parseError.message}`);
  }

  const isValid = errors.length === 0;
  
  return {
    isValid,
    errors,
    warnings,
    symbol,
    summary: isValid ? 'VALID' : `INVALID (${errors.length} errors, ${warnings.length} warnings)`
  };
}

/**
 * Validates an array of discoveries and filters out invalid ones
 * @param {Array} discoveries - Array of discovery records
 * @param {Object} options - Validation options
 * @returns {Object} - Validation results with valid/invalid discoveries
 */
function validateDiscoveries(discoveries, options = {}) {
  const { strictMode = true, logResults = true } = options;
  
  const validDiscoveries = [];
  const invalidDiscoveries = [];
  const allErrors = [];
  const allWarnings = [];

  for (const discovery of discoveries) {
    const validation = validateDiscovery(discovery);
    
    if (validation.isValid || (!strictMode && validation.warnings.length === 0)) {
      validDiscoveries.push(discovery);
    } else {
      invalidDiscoveries.push({
        discovery,
        validation
      });
    }
    
    allErrors.push(...validation.errors);
    allWarnings.push(...validation.warnings);
  }

  const results = {
    totalCount: discoveries.length,
    validCount: validDiscoveries.length,
    invalidCount: invalidDiscoveries.length,
    validDiscoveries,
    invalidDiscoveries,
    errors: allErrors,
    warnings: allWarnings,
    validationPassed: invalidDiscoveries.length === 0
  };

  if (logResults) {
    console.log('🔍 DATA VALIDATION RESULTS:');
    console.log(`   Total discoveries: ${results.totalCount}`);
    console.log(`   Valid: ${results.validCount}`);
    console.log(`   Invalid: ${results.invalidCount}`);
    
    if (allErrors.length > 0) {
      console.log(`\n❌ VALIDATION ERRORS (${allErrors.length}):`);
      allErrors.forEach(error => console.log(`   • ${error}`));
    }
    
    if (allWarnings.length > 0) {
      console.log(`\n⚠️  VALIDATION WARNINGS (${allWarnings.length}):`);
      allWarnings.forEach(warning => console.log(`   • ${warning}`));
    }

    if (results.validationPassed) {
      console.log('✅ All discoveries passed validation');
    } else {
      console.log(`❌ ${results.invalidCount} discoveries failed validation and were rejected`);
    }
  }

  return results;
}

/**
 * Creates a validation middleware for express routes
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware function
 */
function createValidationMiddleware(options = {}) {
  return (req, res, next) => {
    const { discoveries } = req.body;
    
    if (!discoveries || !Array.isArray(discoveries)) {
      return res.status(400).json({
        success: false,
        error: 'REQUEST_VALIDATION_ERROR',
        message: 'Request body must contain discoveries array'
      });
    }

    const validation = validateDiscoveries(discoveries, options);
    
    if (!validation.validationPassed && options.strictMode !== false) {
      return res.status(422).json({
        success: false,
        error: 'DATA_VALIDATION_ERROR',
        message: `${validation.invalidCount} discoveries failed validation`,
        validation: {
          errors: validation.errors,
          warnings: validation.warnings,
          invalidCount: validation.invalidCount
        }
      });
    }

    // Attach validation results to request for use by route handler
    req.validationResults = validation;
    next();
  };
}

module.exports = {
  validateDiscovery,
  validateDiscoveries,
  createValidationMiddleware,
  DataValidationError,
  SUSPICIOUS_VALUES
};