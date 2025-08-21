const express = require("express");
const { getCache, forceRefresh } = require("../../services/alphastack/screener_runner");

// Check if Python adapter should be used
const usePython = (process.env.ALPHASTACK_ENGINE || "").toLowerCase() === "python_v2";
let py;
if (usePython) {
  py = require("../../services/alphastack/py_adapter");
  py.startLoop(); // Start the background refresh loop
}

const router = express.Router();

router.get("/latest", (req, res) => {
  try {
    // Delegate to Python adapter if enabled
    if (usePython && py) {
      const { items, updatedAt, running, error, fresh, engine } = py.getState();
      const limit = Number(req.query.limit || 50);
      const contenders = Number(req.query.contenders || 0);
      
      let responseItems = items.slice(0, limit);
      let topContenders = null;
      
      // Generate contenders if requested
      if (contenders > 0) {
        const K = Math.max(3, Math.min(6, contenders));
        const seed = Number(req.query.seed || 1337);
        
        function relvol(x) {
          return x.rel_vol_30m || x.rel_vol_day || x.indicators?.relvol || 0;
        }
        
        function tiebreak(seed, ticker) {
          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(`${seed}:${ticker}`).digest('hex');
          return parseInt(hash.substring(0, 8), 16);
        }
        
        // Calculate contender scores
        const scoredItems = items.map(x => {
          const rv = relvol(x);
          const atr = x.indicators?.atr_pct || 0;
          const ret5d = x.indicators?.ret_5d || 0;
          
          // Contender boost factors
          let boost = 0;
          boost += (rv >= 2.5 ? 6 : rv >= 1.8 ? 3 : 0);  // High relative volume
          boost += (atr >= 0.08 ? 4 : atr >= 0.05 ? 2 : 0);  // High volatility  
          boost += (ret5d >= 50 ? 4 : ret5d >= 25 ? 2 : 0);  // Strong momentum
          boost += (x.score >= 95 ? 3 : 0);  // Top scores
          
          return {
            ...x,
            contender_score: 0.8 * (x.score || 0) + boost,
            _tiebreak: tiebreak(seed, x.ticker || x.symbol)
          };
        });
        
        // Sort by contender score (desc), then tiebreak
        topContenders = scoredItems
          .sort((a, b) => {
            if (a.contender_score !== b.contender_score) return b.contender_score - a.contender_score;
            if (relvol(a) !== relvol(b)) return relvol(b) - relvol(a);
            if (a.price !== b.price) return a.price - b.price;
            return a._tiebreak - b._tiebreak;
          })
          .slice(0, K)
          .map(x => {
            delete x._tiebreak;  // Clean up temp field
            return x;
          });
      }
      
      const response = { 
        items: responseItems, 
        updatedAt, 
        running, 
        error, 
        fresh,
        success: true,
        count: items.length,
        engine: engine || 'python_v2',
        source: 'alphastack_vigl'
      };
      
      if (topContenders) {
        response.contenders = topContenders;
      }
      
      return res.json(response);
    }
    
    // Fallback to original screener_runner
    const { items, updatedAt, running, error, fresh } = getCache();
    const limit = Number(req.query.limit || 50);
    
    res.json({ 
      items: items.slice(0, limit), 
      updatedAt, 
      running, 
      error, 
      fresh,
      success: true,
      count: items.length,
      engine: 'screener_runner',
      source: 'alphastack_vigl'
    });
  } catch (err) {
    console.error('❌ Discoveries API error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      items: [],
      running: false,
      fresh: false,
      count: 0
    });
  }
});

// Dedicated contenders endpoint for client integration
router.get("/contenders", (req, res) => {
  try {
    const limit = Number(req.query.limit || 6);
    
    // Delegate to Python adapter if enabled
    if (usePython && py) {
      const { items, updatedAt, running, error, fresh, engine } = py.getState();
      
      if (items.length === 0) {
        return res.json({
          items: [],
          contenders: [],
          success: true,
          count: 0,
          message: 'No contenders available',
          engine: 'python_v2'
        });
      }
      
      // Generate contenders (reuse logic from latest endpoint)
      const K = Math.max(3, Math.min(6, limit));
      const seed = Number(req.query.seed || 1337);
      
      function relvol(x) {
        return x.rel_vol_30m || x.rel_vol_day || x.indicators?.relvol || 0;
      }
      
      function tiebreak(seed, ticker) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(`${seed}:${ticker}`).digest('hex');
        return parseInt(hash.substring(0, 8), 16);
      }
      
      // Calculate contender scores
      const scoredItems = items.map(x => {
        const rv = relvol(x);
        const atr = x.indicators?.atr_pct || 0;
        const ret5d = x.indicators?.ret_5d || 0;
        
        // Contender boost factors
        let boost = 0;
        boost += (rv >= 2.5 ? 6 : rv >= 1.8 ? 3 : 0);  // High relative volume
        boost += (atr >= 0.08 ? 4 : atr >= 0.05 ? 2 : 0);  // High volatility
        boost += (ret5d >= 0.05 ? 3 : ret5d >= 0.02 ? 1 : -1);  // Recent momentum
        
        const contenderScore = x.score + boost + (tiebreak(seed, x.ticker) % 10);
        
        return {
          ticker: x.ticker,
          score: contenderScore,
          originalScore: x.score,
          boost,
          price: x.price || x.indicators?.price || 0,
          action: contenderScore >= 75 ? 'BUY' : contenderScore >= 65 ? 'EARLY_READY' : 'PRE_BREAKOUT',
          confidence: Math.min(95, Math.max(60, contenderScore)),
          engine: 'alphastack',
          run_id: `discovery_${updatedAt}`,
          snapshot_ts: new Date(updatedAt).toISOString()
        };
      });
      
      // Sort by contender score and take top K
      const topContenders = scoredItems
        .sort((a, b) => b.score - a.score)
        .slice(0, K);
      
      return res.json({
        items: topContenders,
        contenders: topContenders,
        success: true,
        count: topContenders.length,
        engine: 'python_v2',
        updatedAt,
        seed
      });
    }
    
    // Fallback to original screener_runner
    const { items, updatedAt, running, error, fresh } = getCache();
    
    if (items.length === 0) {
      return res.json({
        items: [],
        contenders: [],
        success: true,
        count: 0,
        message: 'No contenders available',
        engine: 'screener_runner'
      });
    }
    
    // Simple contender selection for fallback
    const contenders = items
      .filter(x => x.score >= 65)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(x => ({
        ticker: x.ticker,
        score: x.score,
        price: x.price || 0,
        action: x.score >= 75 ? 'BUY' : 'EARLY_READY',
        confidence: Math.min(95, Math.max(60, x.score)),
        engine: 'alphastack',
        run_id: `discovery_${updatedAt}`,
        snapshot_ts: new Date(updatedAt).toISOString()
      }));
    
    res.json({
      items: contenders,
      contenders,
      success: true,
      count: contenders.length,
      engine: 'screener_runner',
      updatedAt
    });
    
  } catch (err) {
    console.error('❌ Contenders API error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      items: [],
      contenders: [],
      count: 0
    });
  }
});

router.post("/refresh", (req, res) => {
  try {
    // Delegate to Python adapter if enabled
    if (usePython && py) {
      const refreshed = py.runOnce();
      return res.json({ 
        ok: true, 
        lastUpdated: Date.now(),
        refreshTriggered: refreshed,
        engine: 'python_v2'
      });
    }
    
    // Fallback to original screener_runner
    const { updatedAt } = getCache();
    const refreshed = forceRefresh();
    
    res.json({ 
      ok: true, 
      lastUpdated: updatedAt,
      refreshTriggered: refreshed,
      engine: 'screener_runner'
    });
  } catch (err) {
    console.error('❌ Discoveries refresh error:', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  const { items, updatedAt, running, error, fresh } = getCache();
  
  res.json({
    healthy: !error && (fresh || running),
    itemCount: items.length,
    lastUpdate: new Date(updatedAt).toISOString(),
    running,
    fresh,
    error,
    cacheAge: Date.now() - updatedAt
  });
});

// Snapshot endpoint - returns exact saved JSON
router.get("/snapshot", (req, res) => {
  try {
    // Get snapshot path from Python adapter if enabled
    if (usePython && py) {
      const state = py.getState(9999);
      if (!state.snapPath) {
        return res.status(404).json({ 
          ok: false, 
          error: 'No snapshot available',
          message: 'Run a refresh first to generate a snapshot'
        });
      }
      const fullPath = require('path').resolve(state.snapPath);
      return res.sendFile(fullPath);
    }
    
    // Fallback error
    res.status(404).json({ 
      ok: false, 
      error: 'Snapshots only available with Python engine',
      engine: 'screener_runner'
    });
  } catch (err) {
    console.error('❌ Snapshot error:', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;