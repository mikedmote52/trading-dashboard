/**
 * VIGL Discovery Configuration - Single Source of Truth
 * Defines screening criteria, scoring thresholds, and classification rules
 */

const DISCOVERY = {
  // Price screening
  enforcePriceCap: true,
  priceCap: 100,
  
  // Volume and momentum filters
  minRVOL: 1.5,                    // Relative volume threshold
  minLiquidity: 100000,            // Minimum daily volume in shares
  
  // Short squeeze indicators
  minShortInterest: 0.15,          // 15% minimum short interest
  altSqueeze: {                    // Alternative squeeze criteria
    util: 0.85,                    // 85% utilization
    fee: 0.20,                     // 20% borrow fee
    floatMaxM: 50                  // Max 50M float
  },
  
  // Processing limits
  topK: 20,                        // Max candidates for expensive analysis
  concurrency: 5,                  // Rate limiting for API calls
  
  // VIGL classification thresholds (0-4 scale) - LOWERED FOR DEV
  classify: {
    buy: 1.0,                      // Score ≥1.0 = BUY (was 2.5)
    watch: 0.5,                    // Score ≥0.5 = WATCHLIST (was 1.75)
    monitor: 0.25                  // Score ≥0.25 = MONITOR (was 1.25)
  },
  
  // Scoring component weights
  weights: {
    volume: 0.25,                  // Relative volume importance
    squeeze: 0.20,                 // Short squeeze metrics
    catalyst: 0.20,                // News/events
    sentiment: 0.15,               // Social buzz
    options: 0.10,                 // Options activity
    technical: 0.10                // Chart patterns
  },
  
  // Cache TTLs
  cacheTTL: {
    float: 2592000000,             // 30 days in ms (static data)
    short: 86400000,               // 1 day in ms
    options: 900000,               // 15 minutes in ms
    social: 600000                 // 10 minutes in ms
  }
};

module.exports = { DISCOVERY };