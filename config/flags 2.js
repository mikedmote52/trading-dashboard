// Feature Flags for AlphaStack Discovery
// Safe experimentation without breaking v1 stable baseline

const FLAGS = {
  // Core discovery features (v1 stable)
  "use_contender_tracking": true,
  "use_comprehensive_thesis": true,
  "use_alpaca_integration": true,
  
  // Experimental features (v2-exp)
  "use_conviction_gate": false,       // Stage 3.5 filtering
  "use_enhanced_boosts": false,       // Additional signal boosts
  "options_flow_signals": false,      // Options flow analysis
  "technical_indicators": false,      // RSI, EMA crossovers
  "repeat_contender_bonus": false,    // Persistence tracking
  "shadow_mode_v2": false,           // Run v2 alongside v1
  "canary_rollout": false,           // 10% traffic to v2
  
  // Safety and monitoring
  "enable_telemetry": true,
  "guardrail_tests": true,
  "determinism_checks": true,
  
  // UI experiments
  "show_contender_scores": false,     // Display raw contender scores
  "options_flow_badges": false,       // Show options activity
  "momentum_heatmap": false,         // Color-coded momentum
};

function isEnabled(flagName) {
  return FLAGS[flagName] || false;
}

function enableFlag(flagName) {
  FLAGS[flagName] = true;
  console.log(`🚩 Flag enabled: ${flagName}`);
}

function disableFlag(flagName) {
  FLAGS[flagName] = false;
  console.log(`🚩 Flag disabled: ${flagName}`);
}

function getFlags() {
  return { ...FLAGS };
}

module.exports = {
  isEnabled,
  enableFlag,
  disableFlag,
  getFlags,
  FLAGS
};