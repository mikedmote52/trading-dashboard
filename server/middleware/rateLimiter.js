/**
 * Rate Limiting Middleware
 * Protects against API abuse and ensures system stability
 */

const rateLimiters = new Map();

function createRateLimit(windowMs, maxRequests) {
  return (req, res, next) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get or create client request log
    if (!rateLimiters.has(clientId)) {
      rateLimiters.set(clientId, []);
    }
    
    const requests = rateLimiters.get(clientId);
    
    // Remove old requests outside the window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    rateLimiters.set(clientId, recentRequests);
    
    // Check if limit exceeded
    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }
    
    // Add current request
    recentRequests.push(now);
    rateLimiters.set(clientId, recentRequests);
    
    next();
  };
}

// Clean up old rate limit data every 5 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  
  for (const [clientId, requests] of rateLimiters.entries()) {
    const recentRequests = requests.filter(timestamp => timestamp > now - maxAge);
    if (recentRequests.length === 0) {
      rateLimiters.delete(clientId);
    } else {
      rateLimiters.set(clientId, recentRequests);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  // Different limits for different endpoints
  general: createRateLimit(60 * 1000, 60),        // 60 requests per minute
  api: createRateLimit(60 * 1000, 30),           // 30 API calls per minute  
  scan: createRateLimit(5 * 60 * 1000, 5),       // 5 scans per 5 minutes
  portfolio: createRateLimit(60 * 1000, 100),    // 100 portfolio requests per minute (increased for LPI v2)
};