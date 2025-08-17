/**
 * Feature Flag Management System
 * Enables safe rollout and instant rollback for AlphaStack V3 features
 */

const FEATURE_FLAGS = {
  // V3 Dashboard Features
  ALPHASTACK_V3_ENABLED: process.env.ALPHASTACK_V3_ENABLED === 'true',
  V3_PERFORMANCE_MODE: process.env.V3_PERFORMANCE_MODE === 'true',
  V3_REAL_TIME_UPDATES: process.env.V3_REAL_TIME_UPDATES === 'true',
  
  // UI Components
  V3_DENSE_LAYOUT: process.env.V3_DENSE_LAYOUT === 'true',
  V3_MOBILE_OPTIMIZATION: process.env.V3_MOBILE_OPTIMIZATION === 'true',
  V3_DARK_THEME: process.env.V3_DARK_THEME !== 'false', // Default true
  
  // API Features
  V3_API_CACHING: process.env.V3_API_CACHING === 'true',
  V3_ERROR_BOUNDARIES: process.env.V3_ERROR_BOUNDARIES !== 'false', // Default true
  V3_GRACEFUL_DEGRADATION: process.env.V3_GRACEFUL_DEGRADATION !== 'false', // Default true
  
  // Safety Features (always enabled in production)
  ALPHASTACK_PROTECTION: true, // Cannot be disabled
  READ_ONLY_MODE: process.env.NODE_ENV === 'production' || process.env.READ_ONLY_MODE === 'true',
  CIRCUIT_BREAKER: process.env.V3_CIRCUIT_BREAKER !== 'false', // Default true
  
  // Development Features
  DEBUG_MODE: process.env.NODE_ENV === 'development' || process.env.V3_DEBUG === 'true',
  PERFORMANCE_MONITORING: process.env.V3_PERF_MONITOR === 'true',
  API_LOGGING: process.env.V3_API_LOGGING === 'true'
};

/**
 * Check if a feature is enabled
 * @param {string} flag - Feature flag name
 * @returns {boolean} - Whether the feature is enabled
 */
function isEnabled(flag) {
  if (!(flag in FEATURE_FLAGS)) {
    console.warn(`⚠️ Unknown feature flag: ${flag}`);
    return false;
  }
  
  return FEATURE_FLAGS[flag];
}

/**
 * Get all enabled features
 * @returns {string[]} - Array of enabled feature names
 */
function getEnabledFeatures() {
  return Object.entries(FEATURE_FLAGS)
    .filter(([_, enabled]) => enabled)
    .map(([flag, _]) => flag);
}

/**
 * Check if AlphaStack V3 should be active
 * @returns {boolean} - Whether to show V3 dashboard
 */
function shouldUseV3() {
  return isEnabled('ALPHASTACK_V3_ENABLED') && !isInFallbackMode();
}

/**
 * Check if system is in fallback mode (V2 only)
 * @returns {boolean} - Whether to use V2 fallback
 */
function isInFallbackMode() {
  // Fallback conditions
  return (
    process.env.FORCE_V2_FALLBACK === 'true' ||
    process.env.ALPHASTACK_V3_DISABLED === 'true'
  );
}

/**
 * Get configuration for current feature flag state
 * @returns {object} - Configuration object
 */
function getConfig() {
  return {
    version: shouldUseV3() ? 'v3' : 'v2',
    features: getEnabledFeatures(),
    protection: {
      alphastack_immutable: true,
      read_only_mode: isEnabled('READ_ONLY_MODE'),
      circuit_breaker: isEnabled('CIRCUIT_BREAKER')
    },
    performance: {
      real_time_updates: isEnabled('V3_REAL_TIME_UPDATES'),
      api_caching: isEnabled('V3_API_CACHING'),
      performance_mode: isEnabled('V3_PERFORMANCE_MODE')
    }
  };
}

module.exports = {
  isEnabled,
  shouldUseV3,
  isInFallbackMode,
  getEnabledFeatures,
  getConfig,
  FEATURE_FLAGS
};