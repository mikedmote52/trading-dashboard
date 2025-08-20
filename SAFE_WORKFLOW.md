# Safe Development Workflow - No Disruption Plan

## Current State
- **Branch**: `feat/thesis-and-ui-explainers` (LOCAL ONLY - not pushed)
- **Working Systems**: 
  - ✅ AlphaStack Discovery with 2-tier momentum
  - ✅ Cold-tape seeding (no empty grids)
  - ✅ 30-minute scan intervals
  - ⚠️ Portfolio Intelligence (needs completion)

## Safe Next Steps (NO MOCK DATA)

### 1. Complete Portfolio Intelligence WITHOUT Breaking Current System

```bash
# Stay in current feature branch
git status  # Verify we're in feat/thesis-and-ui-explainers

# Create backup of current working state
git stash
git stash save "Working discovery system before portfolio updates"
git stash pop  # Bring changes back
```

### 2. Portfolio Intelligence Enhancement Plan

**Files to Update (Real Data Only)**:
- `/server/services/portfolio-intelligence.js` - Add action recommendations
- `/public/js/enhancedPortfolio.js` - Display recommendations in UI
- NO CHANGES to discovery system files

**New Features to Add**:
```javascript
// Per-stock recommendations with REAL analysis
{
  symbol: "AAPL",
  action: "HOLD",  // or BUY_MORE, TRIM, SELL
  reason: "Above VWAP, RSI neutral, thesis intact",
  risk_level: "LOW",
  stop_loss: 165.50,
  take_profit: 185.00
}
```

### 3. Testing Strategy (No Mock Data)

```bash
# Test with REAL portfolio data from Alpaca
curl http://localhost:3003/api/dashboard

# Test new portfolio advice endpoint (when ready)
curl http://localhost:3003/api/portfolio/advice

# Run preflight to ensure nothing broke
./alpha-preflight.sh
```

### 4. Learning System Integration (Phase 2)

**Find existing learning system**:
```bash
find . -name "*learn*" -o -name "*feedback*" -o -name "*outcome*"
```

**Integration points**:
- Track real trade outcomes in SQLite
- Adjust scoring weights based on actual performance
- NO simulated trades

### 5. Pre-Deployment Checklist

Before pushing to GitHub/Render:

- [ ] All tests pass with REAL data
- [ ] Preflight script shows GREEN
- [ ] Portfolio shows actionable recommendations
- [ ] No mock/fake data in codebase
- [ ] SMS alerts configured (optional)

### 6. Deployment Commands (When Ready)

```bash
# Commit all changes
git add -A
git commit -m "feat: complete portfolio intelligence with real recommendations"

# Push feature branch to GitHub
git push -u origin feat/thesis-and-ui-explainers

# Create PR on GitHub
# Review changes
# Merge to main
# Deploy to Render automatically triggers
```

## Critical Rules

1. **NO MOCK DATA** - All functions must work with real Alpaca/Polygon data
2. **NO BREAKING CHANGES** - Discovery system must keep working
3. **TEST LOCALLY FIRST** - Everything verified on localhost:3003
4. **INCREMENTAL UPDATES** - Small changes, test, repeat

## Current TODO Priority

1. ✅ Discovery system working
2. 🔧 Portfolio Intelligence - Add action recommendations
3. 🔧 Learning System - Find and integrate
4. 🚀 Deploy to Render

## Environment Variables Already Set

```bash
ALERTS_MINUTES=30
SCAN_INTERVAL_MIN=30
SELECT_ENGINE=optimized
NEW_DASH_ENABLED=true
```

## Files NOT to Touch (Working Fine)

- `/config/discovery.js`
- `/server/services/squeeze/gates_optimized.js`
- `/server/services/discovery_service.js`
- `/public/components/thesis-discovery.js`

Focus only on Portfolio Intelligence completion!