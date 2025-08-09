/**
 * Promise queue for rate-limited API calls
 * Executes promises sequentially with configurable delays
 */

/**
 * Execute an array of promise-returning functions with rate limiting
 * @param {Array<Function>} fnArray Array of functions that return promises
 * @param {number} rateMs Delay between executions in milliseconds (default: 1000)
 * @returns {Promise<Array>} Array of resolved results in order
 */
async function runQueued(fnArray, rateMs = 1000) {
  if (!Array.isArray(fnArray)) {
    throw new Error('fnArray must be an array of functions');
  }
  
  if (fnArray.length === 0) {
    return [];
  }
  
  console.log(`🚦 Starting queued execution of ${fnArray.length} tasks (${rateMs}ms intervals)`);
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    
    if (typeof fn !== 'function') {
      throw new Error(`Item ${i} is not a function`);
    }
    
    try {
      console.log(`⏳ Executing task ${i + 1}/${fnArray.length}`);
      const iterationStart = Date.now();
      
      // Execute the promise-returning function
      const result = await fn();
      results.push(result);
      
      const iterationTime = Date.now() - iterationStart;
      console.log(`✅ Task ${i + 1} completed in ${iterationTime}ms`);
      
      // Add delay before next task (except for last task)
      if (i < fnArray.length - 1) {
        console.log(`⏱️  Waiting ${rateMs}ms before next task...`);
        await new Promise(resolve => setTimeout(resolve, rateMs));
      }
      
    } catch (error) {
      console.error(`❌ Task ${i + 1} failed:`, error.message);
      
      // Store the error in results to maintain order
      results.push({
        error: error.message,
        index: i,
        failed: true
      });
      
      // Continue with rate limiting even on error
      if (i < fnArray.length - 1) {
        console.log(`⏱️  Error recovery delay: ${rateMs}ms before next task...`);
        await new Promise(resolve => setTimeout(resolve, rateMs));
      }
    }
  }
  
  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => !r?.failed).length;
  const failCount = results.length - successCount;
  
  console.log(`🏁 Queue completed in ${totalTime}ms: ${successCount} success, ${failCount} failed`);
  
  return results;
}

/**
 * Create a batch of promise-returning functions for symbols
 * @param {Array<string>} symbols Array of stock symbols
 * @param {Function} taskFn Function that takes a symbol and returns a promise
 * @returns {Array<Function>} Array of bound functions ready for runQueued
 */
function createSymbolTasks(symbols, taskFn) {
  if (!Array.isArray(symbols)) {
    throw new Error('symbols must be an array');
  }
  
  if (typeof taskFn !== 'function') {
    throw new Error('taskFn must be a function');
  }
  
  return symbols.map(symbol => {
    return async () => {
      const result = await taskFn(symbol);
      return { symbol, ...result };
    };
  });
}

/**
 * Execute a single function with retry logic
 * @param {Function} fn Promise-returning function to execute
 * @param {number} maxRetries Maximum number of retries (default: 3)
 * @param {number} retryDelayMs Delay between retries in milliseconds (default: 1000)
 * @returns {Promise} Result of the function
 */
async function executeWithRetry(fn, maxRetries = 3, retryDelayMs = 1000) {
  if (typeof fn !== 'function') {
    throw new Error('fn must be a function');
  }
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 1) {
        console.log(`✅ Function succeeded on attempt ${attempt}`);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      if (attempt <= maxRetries) {
        console.log(`⚠️  Attempt ${attempt} failed: ${error.message}, retrying in ${retryDelayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      } else {
        console.error(`❌ Function failed after ${maxRetries + 1} attempts`);
      }
    }
  }
  
  throw lastError;
}

module.exports = {
  runQueued,
  createSymbolTasks,
  executeWithRetry
};