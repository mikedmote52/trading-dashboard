#!/usr/bin/env node
/**
 * Discovery Deduplication Utilities
 * Removes duplicate VIGL pattern discoveries and improves signal quality
 */

/**
 * Deduplicates discoveries by symbol, keeping the highest scoring entry per symbol
 * @param {Array} discoveries - Array of discovery objects
 * @returns {Array} - Deduplicated array with unique symbols
 */
function deduplicateBySymbol(discoveries) {
  if (!Array.isArray(discoveries) || discoveries.length === 0) {
    return discoveries;
  }
  
  const symbolMap = new Map();
  
  for (const discovery of discoveries) {
    const symbol = discovery.symbol;
    if (!symbol) continue;
    
    const existing = symbolMap.get(symbol);
    if (!existing || discovery.score > existing.score) {
      symbolMap.set(symbol, discovery);
    }
  }
  
  // Return deduplicated discoveries sorted by score (highest first)
  return Array.from(symbolMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Filters out near-duplicate discoveries based on similarity thresholds
 * @param {Array} discoveries - Array of discovery objects
 * @param {Object} options - Filtering options
 * @returns {Array} - Filtered array without near-duplicates
 */
function filterNearDuplicates(discoveries, options = {}) {
  const {
    scoreDifferenceThreshold = 0.1,  // Minimum score difference
    volumeSpikeSimilarity = 0.9,     // Volume spike similarity threshold (0-1)
    momentumSimilarity = 0.9         // Momentum similarity threshold (0-1)
  } = options;
  
  if (!Array.isArray(discoveries) || discoveries.length <= 1) {
    return discoveries;
  }
  
  const filtered = [];
  
  for (const discovery of discoveries) {
    let isDuplicate = false;
    
    for (const existing of filtered) {
      // Check if this is a near-duplicate of an existing discovery
      const scoreDiff = Math.abs((discovery.score || 0) - (existing.score || 0));
      const volumeDiff = Math.abs((discovery.volumeSpike || 0) - (existing.volumeSpike || 0));
      const momentumDiff = Math.abs((discovery.momentum || 0) - (existing.momentum || 0));
      
      const maxVolumeSpike = Math.max(discovery.volumeSpike || 0, existing.volumeSpike || 0);
      const maxMomentum = Math.max(Math.abs(discovery.momentum || 0), Math.abs(existing.momentum || 0));
      
      const volumeSimilarity = maxVolumeSpike > 0 ? 1 - (volumeDiff / maxVolumeSpike) : 1;
      const momentumSimilarityRatio = maxMomentum > 0 ? 1 - (momentumDiff / maxMomentum) : 1;
      
      if (scoreDiff <= scoreDifferenceThreshold && 
          volumeSimilarity >= volumeSpikeSimilarity &&
          momentumSimilarityRatio >= momentumSimilarity) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      filtered.push(discovery);
    }
  }
  
  return filtered;
}

/**
 * Applies minimum quality thresholds to filter out low-value discoveries
 * @param {Array} discoveries - Array of discovery objects
 * @param {Object} thresholds - Quality thresholds
 * @returns {Array} - Filtered array meeting quality standards
 */
function applyQualityFilter(discoveries, thresholds = {}) {
  const {
    minScore = 2.0,           // Minimum VIGL score
    minVolumeSpike = 1.5,     // Minimum volume spike multiplier
    maxPrice = 1000,          // Maximum price filter (avoid weird data)
    minPrice = 0.01,          // Minimum price filter (avoid penny stocks if desired)
    requiredFields = ['symbol']
  } = thresholds;
  
  return discoveries.filter(discovery => {
    // Check required fields
    for (const field of requiredFields) {
      if (discovery[field] === undefined || discovery[field] === null) {
        return false;
      }
    }
    
    // Apply quality thresholds (handle both raw and UI field names)
    const score = discovery.score || discovery.viglScore || 0;
    const volumeSpike = discovery.volumeSpike || discovery.rel_volume || 0;
    const price = discovery.currentPrice || discovery.price || 0;
    
    if (score < minScore) return false;
    if (volumeSpike < minVolumeSpike) return false;
    if (price > 0 && price < minPrice) return false;
    if (price > maxPrice) return false;
    
    // Filter out placeholder data
    if (price === 50 || price === 100) return false;
    
    return true;
  });
}

/**
 * Complete deduplication and filtering pipeline
 * @param {Array} discoveries - Raw discovery array
 * @param {Object} options - Processing options
 * @returns {Object} - Results with filtered discoveries and stats
 */
function processDiscoveries(discoveries, options = {}) {
  const {
    enableSymbolDeduplication = true,
    enableNearDuplicateFiltering = true,
    enableQualityFilter = true,
    qualityThresholds = {},
    nearDuplicateOptions = {}
  } = options;
  
  const originalCount = discoveries.length;
  let processed = [...discoveries];
  const stats = {
    originalCount,
    symbolDeduplicatedCount: 0,
    nearDuplicateFilteredCount: 0,
    qualityFilteredCount: 0,
    finalCount: 0
  };
  
  // Step 1: Symbol deduplication
  if (enableSymbolDeduplication) {
    processed = deduplicateBySymbol(processed);
    stats.symbolDeduplicatedCount = processed.length;
  }
  
  // Step 2: Near-duplicate filtering
  if (enableNearDuplicateFiltering) {
    processed = filterNearDuplicates(processed, nearDuplicateOptions);
    stats.nearDuplicateFilteredCount = processed.length;
  }
  
  // Step 3: Quality filtering
  if (enableQualityFilter) {
    processed = applyQualityFilter(processed, qualityThresholds);
    stats.qualityFilteredCount = processed.length;
  }
  
  stats.finalCount = processed.length;
  
  return {
    discoveries: processed,
    stats,
    reductionPercentage: originalCount > 0 ? ((originalCount - processed.length) / originalCount * 100).toFixed(1) : 0
  };
}

/**
 * Express middleware for discovery deduplication
 */
function createDeduplicationMiddleware(options = {}) {
  return (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      if (data && data.discoveries && Array.isArray(data.discoveries)) {
        const result = processDiscoveries(data.discoveries, options);
        
        // Add deduplication info to response
        data.discoveries = result.discoveries;
        data.deduplication = {
          stats: result.stats,
          reductionPercentage: result.reductionPercentage
        };
        
        if (result.stats.originalCount > result.stats.finalCount) {
          console.log(`🧹 Deduplication: ${result.stats.originalCount} → ${result.stats.finalCount} discoveries (${result.reductionPercentage}% reduction)`);
        }
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

module.exports = {
  deduplicateBySymbol,
  filterNearDuplicates,
  applyQualityFilter,
  processDiscoveries,
  createDeduplicationMiddleware
};