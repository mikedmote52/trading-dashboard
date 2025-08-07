# Trading Dashboard Development Patterns

## Proven Integration Pattern ✅

### Python System → Web Dashboard
```python
# 1. Export from working Python system
def export_for_dashboard():
    vigl_results = run_vigl_discovery()
    return {
        'discoveries': [
            {
                'symbol': result.ticker,
                'confidence': result.vigl_similarity_score,
                'volumeSpike': result.volume_spike_ratio,
                'momentum': result.price_momentum,
                'priceTarget': calculate_target(result),
                'timeline': estimate_timeline(result)
            }
        ]
    }
```

```javascript
// 2. Import to web dashboard (no recreation needed)
async function loadRealData() {
    const data = JSON.parse(fs.readFileSync('real_data.json'));
    return data.discoveries; // Use directly - don't recreate
}
```

## UI Component Patterns

### Trading Modal Template
```javascript
function showTradeModal(action, symbol, qty) {
    // Calculate recommendations based on real data
    const entryTarget = currentPrice * 0.98; // 2% below
    const stopLoss = currentPrice * 0.85;    // 15% risk
    const priceTarget = calculateTarget(symbol); // From system data
    
    // Show modal with all recommendations
}
```

### Compact Position Tile
```javascript
// Efficient 6-column grid layout
<div class="grid grid-cols-6 gap-2 text-xs">
    <div>Qty: ${qty}</div>
    <div>Price: $${price}</div>
    <div>Value: $${value}</div>
    <div>Target: $${target}</div>
    <div>Timeline: ${timeline}</div>
    <div>Risk: ${risk}%</div>
</div>
```

## Development Workflow ✅

1. **Start with working Python systems** (don't recreate)
2. **Create JSON export functions**
3. **Build web UI that consumes exports**
4. **Deploy frequently to Render**
5. **Get real user feedback** (not theoretical)
6. **Iterate based on actual usage**

## Key Learnings

- ❌ Don't recreate working systems in different languages
- ✅ Integrate working systems via standard data formats
- ❌ Don't add "VIGL Score" tiles that confuse users
- ✅ Show clear thesis explanations users understand  
- ❌ Don't use fake/mock data ever
- ✅ Use real system outputs always
- ❌ Don't make complex UIs that waste space
- ✅ Make compact, information-dense interfaces