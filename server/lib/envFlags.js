/**
 * Environment flag parsing utility
 * Properly converts env string values to booleans
 */

/**
 * Parse environment flag to boolean
 * @param {string} key - Environment variable name
 * @param {boolean} defaultValue - Default value if env var is not set
 * @returns {boolean}
 */
function flag(key, defaultValue = false) {
  const value = process.env[key];
  if (value == null || value === undefined) {
    return defaultValue;
  }
  
  const normalized = String(value).trim().toLowerCase();
  
  // Truthy values
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  
  // Falsy values
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  
  // Return default for any other value
  return defaultValue;
}

module.exports = {
  flag
};