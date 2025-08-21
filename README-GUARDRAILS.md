# AlphaStack Discovery Guardrails System

## 🔒 **Lock-but-Learn Policy**

> *`discovery-v1-stable` is immutable; all improvements land in `discovery-v2-exp`, controlled by flags & config, and are promoted to v1 only after beating v1 on hit rate, run-up, drawdown, and liquidity—while preserving determinism.*

## 🎯 **System Architecture**

### Branches & Tags
- **`discovery-v1-stable`**: Frozen baseline (tag: `discovery-v1.0`)
- **`discovery-v2-exp`**: Experimental iteration branch
- **`main`**: Integration branch for approved features

### Guardrails Framework
```
Stable Baseline → Config-Driven Experiments → Promotion Criteria → Safe Rollout
      ↓                    ↓                        ↓                 ↓
  discovery-v1.0      discovery.yaml         Performance Tests    Feature Flags
    (frozen)         + feature flags        + Determinism        + Canary Deploy
```

## 📊 **Promotion Criteria**

A v2 experiment can be promoted to v1 stable **only if ALL criteria are met** over a 20-day rolling window:

### Performance Requirements
- **Hit Rate**: v2 ≥ v1 by **+3-5 percentage points** (positions >+20% within 10 sessions)
- **Median Run-up**: v2 ≥ v1 median max run-up
- **Max Drawdown**: v2 ≤ v1 max drawdown
- **Win Rate**: v2 ≥ v1 overall win rate

### Quality Requirements  
- **Liquidity**: Average ADV percentile ≥ v1's percentile
- **Diversity**: ≥8 unique first letters in top-50 picks
- **Determinism**: Same seed → identical output order
- **No Bias**: No price/alphabet biases reintroduced

### Technical Requirements
- **Schema Compatibility**: All API contracts preserved
- **UI Compatibility**: All existing features functional
- **Order Flow**: Secure Alpaca integration working
- **Contender Tracking**: NEW badges and competition logic intact

## 🧪 **Experimentation Workflow**

### 1. Safe Development
```bash
# Switch to experimental branch
git checkout discovery-v2-exp

# Edit config/discovery.yaml or config/flags.js
# Add new features behind feature flags

# Test with experiment runner
node scripts/experiment-runner.js 1337 50

# Compare v1 vs v2 output
```

### 2. Config-Driven Changes
```yaml
# config/discovery.yaml
features:
  use_conviction_gate: true    # Enable Stage 3.5 filtering
  technical_indicators: true   # Add RSI/EMA signals
  
contender_boosts:
  above_vwap: 4               # New VWAP signal boost
  ema9_gt_ema20: 3           # EMA crossover boost
```

### 3. Feature Flag Protection
```javascript
// In code
if (isEnabled("technical_indicators")) {
  score += calculateTechnicalBoost(stock);  // Safe default: 0
}
```

### 4. Performance Validation
```bash
# Run comparison experiments
node scripts/experiment-runner.js

# Check metrics over time
node scripts/performance-analysis.js --days 20

# Promote if criteria met
git checkout discovery-v1-stable
git merge --no-ff discovery-v2-exp
git tag discovery-v1.1
```

## 🚩 **Feature Flags**

### Stable Features (v1)
- ✅ `use_contender_tracking`: NEW badges for contenders
- ✅ `use_comprehensive_thesis`: Detailed analysis
- ✅ `use_alpaca_integration`: Secure order flow

### Experimental Features (v2)
- 🧪 `use_conviction_gate`: Stage 3.5 filtering
- 🧪 `technical_indicators`: RSI, EMA signals
- 🧪 `options_flow_signals`: Options activity analysis
- 🧪 `shadow_mode_v2`: Run v2 alongside v1
- 🧪 `canary_rollout`: 10% traffic to v2

## 📈 **Telemetry & Learning**

### Decision Logging
```json
{
  "timestamp": "2025-08-21T12:34:56Z",
  "run_id": "2025-08-21T12:34:56Z-1337",
  "engine": "v2-exp",
  "ticker": "EQ",
  "vigl_score": 96,
  "contender_score": 83.8,
  "action": "BUY",
  "signals": {
    "relvol_30m": 2.6,
    "above_vwap": true,
    "ema9_gt_ema20": true,
    "rsi": 66
  }
}
```

### Outcome Tracking
```json
{
  "timestamp": "2025-08-31T16:00:00Z",
  "ticker": "EQ",
  "position_id": "pos_abc123",
  "entry_price": 1.14,
  "current_price": 1.41,
  "return_pct": 0.24,
  "max_runup": 0.41,
  "max_drawdown": -0.09,
  "status": "tp1"
}
```

## 🛡️ **Guardrail Tests** 

### Automated CI Tests
- **Determinism**: Same seed → identical results
- **Alphabet Diversity**: Top-50 covers ≥8 letters  
- **Schema Validation**: API contracts intact
- **UI E2E**: Load contenders → Buy flow → Order success
- **Performance Baseline**: No regression in core metrics

### Manual Validation
- **Visual UI**: Contenders display correctly
- **NEW Badges**: Properly track new vs existing
- **Order Flow**: Alpaca integration functional
- **Data Quality**: Realistic price targets and thesis

## 🔄 **Rollout Strategy**

### Phase 1: Shadow Mode
- Run v2 alongside v1 (no live trades)
- Log picks and hypothetical P&L
- Monitor for 20+ trading days

### Phase 2: Canary Deploy
- Route 10% of buy clicks to v2 contenders
- A/B test performance in live environment
- Immediate rollback if issues detected

### Phase 3: Full Promotion
- Flip feature flag after metrics confirm superiority
- Keep v1 available as emergency fallback
- Update stable tag and documentation

## 📚 **Usage Examples**

### Quick Experiment
```bash
# Enable conviction gate experiment
node -e "const flags = require('./config/flags'); flags.enableFlag('use_conviction_gate')"

# Compare with stable
node scripts/experiment-runner.js

# Review results
ls experiments/comparisons/
```

### Config Tuning
```bash
# Edit contender boost weights
vim config/discovery.yaml

# Test new configuration  
ALPHASTACK_CONFIG=config/discovery.yaml npm start

# Monitor performance
tail -f logs/telemetry/decisions_$(date +%Y-%m-%d).jsonl
```

### Emergency Rollback
```bash
# Disable all experimental features
node -e "const flags = require('./config/flags'); flags.disableFlag('use_conviction_gate')"

# Or switch to stable branch
git checkout discovery-v1-stable
npm start
```

---

This guardrails system ensures **continuous innovation** while **protecting proven performance** through systematic testing, gradual rollout, and data-driven promotion criteria.