/**
 * Discovery Engine Configuration
 * Optimized for catching Trade-ready runners and Early-ready stealth seeds
 */

const DISCOVERY = {
  // Base thresholds
  base: {
    priceMin: parseFloat(process.env.DISCOVERY_PRICE_MIN || 2),
    priceMax: parseFloat(process.env.DISCOVERY_PRICE_MAX || 100),
    rsiMin: parseFloat(process.env.DISCOVERY_RSI_MIN || 58),
    rsiMax: parseFloat(process.env.DISCOVERY_RSI_MAX || 78),
    atrPctMin: parseFloat(process.env.DISCOVERY_ATR_PCT_MIN || 3.5),
    relVolTradeReady: parseFloat(process.env.DISCOVERY_REL_VOL_TRADE || 2.0),
    relVolEarly: parseFloat(process.env.DISCOVERY_REL_VOL_EARLY || 1.5),
    highPriorityRelVol: parseFloat(process.env.DISCOVERY_HIGH_PRIORITY_REL_VOL || 3.0),
    minDollarVolume: parseFloat(process.env.DISCOVERY_MIN_DOLLAR_VOL || 1000000),
    minShares: parseFloat(process.env.DISCOVERY_MIN_SHARES || 500000)
  },
  
  // Scoring weights (total 100)
  weights: {
    momentum: parseFloat(process.env.DISCOVERY_WEIGHT_MOMENTUM || 25),
    squeeze: parseFloat(process.env.DISCOVERY_WEIGHT_SQUEEZE || 20),
    catalyst: parseFloat(process.env.DISCOVERY_WEIGHT_CATALYST || 30),
    sentiment: parseFloat(process.env.DISCOVERY_WEIGHT_SENTIMENT || 15),
    technical: parseFloat(process.env.DISCOVERY_WEIGHT_TECHNICAL || 10)
  },
  
  // Readiness tiers
  tiers: {
    tradeReady: {
      scoreMin: parseFloat(process.env.DISCOVERY_TRADE_READY_MIN || 80),
      aboveVWAP: process.env.DISCOVERY_TRADE_READY_VWAP !== 'false',
      defaultSize: parseFloat(process.env.DISCOVERY_TRADE_READY_SIZE || 100)
    },
    earlyReady: {
      scoreMin: parseFloat(process.env.DISCOVERY_EARLY_READY_MIN || 70),
      scoreMax: parseFloat(process.env.DISCOVERY_EARLY_READY_MAX || 79),
      requireCatalyst: process.env.DISCOVERY_EARLY_READY_CATALYST !== 'false',
      defaultSize: parseFloat(process.env.DISCOVERY_EARLY_READY_SIZE || 50)
    },
    watch: {
      scoreMin: parseFloat(process.env.DISCOVERY_WATCH_MIN || 60)
    }
  },
  
  // Cold tape relaxation (when no trade-ready for extended period)
  coldTape: {
    enable: process.env.DISCOVERY_COLD_TAPE_ENABLE !== 'false',
    windowSec: parseInt(process.env.DISCOVERY_COLD_TAPE_WINDOW || 600), // 10 minutes
    relaxTo: {
      rsiMin: parseFloat(process.env.DISCOVERY_COLD_RSI_MIN || 55),
      atrPctMin: parseFloat(process.env.DISCOVERY_COLD_ATR_PCT_MIN || 3.0),
      relVolEarly: parseFloat(process.env.DISCOVERY_COLD_REL_VOL || 1.2)
    },
    scoreCeiling: parseFloat(process.env.DISCOVERY_COLD_SCORE_CEILING || 74) // Watch-only during relaxation
  },
  
  // Catalyst scoring bumps
  catalystBumps: {
    fda: 15,
    earnings: 15,
    merger: 15,
    partnership: 8,
    pr: 5,
    news: 3,
    recencyHalfLife: 48 // hours
  },
  
  // Social velocity tiers (mentions_today / avg_7d)
  socialVelocity: {
    '10x': 10,
    '5x': 7,
    '3x': 5,
    '2x': 3
  },
  
  // Technical bumps
  technicalBumps: {
    vwapHold: 5,
    relVol3x: 10,
    emaCross: 5,
    callPutRatio2x: 5,
    freshCatalyst24h: 5,
    atrPct8: 5
  },
  
  // ADD trigger for existing positions
  addTrigger: {
    scoreMin: 80,
    relVolMin: 2.5,
    aboveVWAP: true,
    defaultSize: 100
  },
  
  // Safety limits
  safety: {
    maxCandidates: parseInt(process.env.DISCOVERY_MAX_CANDIDATES || 50),
    scanDebounceMs: parseInt(process.env.DISCOVERY_SCAN_DEBOUNCE || 5000),
    cacheMaxAge: parseInt(process.env.DISCOVERY_CACHE_MAX_AGE || 300000) // 5 minutes
  }
};

// Track cold tape state
let coldTapeState = {
  active: false,
  activeSince: null,
  lastTradeReadyTime: Date.now(),
  relaxedThresholds: null
};

/**
 * Check if cold tape relaxation should be activated
 */
function checkColdTape(gateCounts) {
  if (!DISCOVERY.coldTape.enable) return false;
  
  const hasTradeReady = gateCounts?.s1_momentum_tradeReady > 0;
  const now = Date.now();
  
  if (hasTradeReady) {
    // Reset cold tape state
    coldTapeState.lastTradeReadyTime = now;
    if (coldTapeState.active) {
      console.log('🔥 Cold tape deactivated - Trade-ready candidates found');
      coldTapeState.active = false;
      coldTapeState.activeSince = null;
      coldTapeState.relaxedThresholds = null;
    }
    return false;
  }
  
  // Check if we should activate cold tape
  const timeSinceLastTradeReady = now - coldTapeState.lastTradeReadyTime;
  const shouldActivate = timeSinceLastTradeReady > (DISCOVERY.coldTape.windowSec * 1000);
  
  if (shouldActivate && !coldTapeState.active) {
    console.log(`❄️ Cold tape activated - No trade-ready for ${DISCOVERY.coldTape.windowSec}s`);
    coldTapeState.active = true;
    coldTapeState.activeSince = now;
    coldTapeState.relaxedThresholds = {
      ...DISCOVERY.base,
      ...DISCOVERY.coldTape.relaxTo
    };
  }
  
  return coldTapeState.active;
}

/**
 * Get current thresholds (base or relaxed)
 */
function getCurrentThresholds() {
  if (coldTapeState.active && coldTapeState.relaxedThresholds) {
    return coldTapeState.relaxedThresholds;
  }
  return DISCOVERY.base;
}

/**
 * Calculate catalyst score with type and recency
 */
function calculateCatalystScore(catalyst) {
  if (!catalyst) return 0;
  
  // Base score by type
  let score = 0;
  const type = (catalyst.type || '').toLowerCase();
  
  if (type.includes('fda')) score = DISCOVERY.catalystBumps.fda;
  else if (type.includes('earnings')) score = DISCOVERY.catalystBumps.earnings;
  else if (type.includes('merger') || type.includes('m&a')) score = DISCOVERY.catalystBumps.merger;
  else if (type.includes('partnership')) score = DISCOVERY.catalystBumps.partnership;
  else if (type.includes('pr') || type.includes('release')) score = DISCOVERY.catalystBumps.pr;
  else score = DISCOVERY.catalystBumps.news;
  
  // Apply recency decay
  const ageHours = catalyst.ageHours || 0;
  const halfLife = DISCOVERY.catalystBumps.recencyHalfLife;
  const decayFactor = Math.pow(0.5, ageHours / halfLife);
  
  return Math.round(score * decayFactor);
}

/**
 * Calculate social velocity score
 */
function calculateSocialVelocityScore(mentionsToday, avgMentions7d) {
  if (!mentionsToday || !avgMentions7d || avgMentions7d === 0) return 0;
  
  const ratio = mentionsToday / avgMentions7d;
  
  if (ratio >= 10) return DISCOVERY.socialVelocity['10x'];
  if (ratio >= 5) return DISCOVERY.socialVelocity['5x'];
  if (ratio >= 3) return DISCOVERY.socialVelocity['3x'];
  if (ratio >= 2) return DISCOVERY.socialVelocity['2x'];
  
  return 0;
}

/**
 * Get applied bumps for a stock
 */
function getAppliedBumps(stock) {
  const bumps = {};
  
  // Technical bumps
  if (stock.price > stock.technicals?.vwap) bumps.vwapHold = true;
  if (stock.relVolume >= 3.0) bumps.relVol3x = true;
  if (stock.technicals?.emaCross) bumps.emaCross = true;
  if (stock.options?.callPutRatio >= 2.0) bumps.callPut2x = true;
  if (stock.catalyst?.ageHours <= 24) bumps.freshCatalyst24h = true;
  if (stock.technicals?.atrPct >= 8) bumps.atrPct8 = true;
  
  // Social velocity
  const socialRatio = (stock.social?.mentionsToday || 0) / (stock.social?.avgMentions7d || 1);
  if (socialRatio >= 10) bumps.social10x = true;
  else if (socialRatio >= 5) bumps.social5x = true;
  else if (socialRatio >= 3) bumps.social3x = true;
  
  // Catalyst type
  const catalystType = (stock.catalyst?.type || '').toLowerCase();
  if (catalystType.includes('fda')) bumps.catalystFDA = true;
  else if (catalystType.includes('earnings')) bumps.catalystEarnings = true;
  else if (catalystType.includes('merger')) bumps.catalystMerger = true;
  
  return bumps;
}

module.exports = {
  DISCOVERY,
  coldTapeState,
  checkColdTape,
  getCurrentThresholds,
  calculateCatalystScore,
  calculateSocialVelocityScore,
  getAppliedBumps
};