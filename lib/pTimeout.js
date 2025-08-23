/**
 * Universal timeout helper for promise-based operations
 * Prevents unbounded I/O from blocking the event loop
 */

class TimeoutError extends Error {
  constructor(msg = 'timeout') {
    super(msg);
    this.name = 'TimeoutError';
    this.code = 'ETIMEDOUT';
  }
}

/**
 * Wrap any promise with a timeout
 * @param {Promise} promise Promise to wrap
 * @param {number} ms Timeout in milliseconds
 * @returns {Promise} Promise that rejects on timeout
 */
function pTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Fetch with AbortController timeout
 * @param {string} url URL to fetch
 * @param {object} opts Fetch options
 * @param {number} ms Timeout in milliseconds
 * @returns {Promise} JSON response or throws
 */
async function fetchJSON(url, opts = {}, ms = 4000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  
  try {
    const response = await fetch(url, { 
      ...opts, 
      signal: controller.signal 
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Safe provider wrapper - catches timeouts and network errors
 * @param {Function} call Function that returns a promise
 * @param {string} label Provider name for telemetry
 * @param {number} ms Timeout in milliseconds
 * @returns {Promise} Data object or error marker
 */
async function safeProvider(call, label, ms = 4000) {
  try {
    return await pTimeout(call(), ms);
  } catch (error) {
    const code = error?.response?.status || 
                 error?.code || 
                 (error?.name === 'AbortError' ? 'ETIMEDOUT' : undefined);
    
    return { 
      __err: { 
        provider: label, 
        code, 
        message: String(error.message || error) 
      } 
    };
  }
}

module.exports = {
  TimeoutError,
  pTimeout,
  fetchJSON,
  safeProvider
};