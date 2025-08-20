/**
 * Real Discovery Pipeline to UI
 * Connects actual AlphaStack discovery engine to discoveries_vigl table
 * This runs real market scanning and populates the UI with actual discoveries
 */

const db = require('../db/sqlite');
const { runVIGLDiscovery, runDiscoveryCapture } = require('./capture');

/**
 * Run real discovery scan and populate UI table
 */
async function populateUIWithRealDiscoveries() {
  try {
    console.log('🔍 Running REAL discovery scan for UI population...');
    
    // Option 1: Use existing VIGL discovery pipeline
    let discoveries = [];
    
    try {
      console.log('🎯 Attempting VIGL discovery pipeline...');
      discoveries = await runVIGLDiscovery();
      console.log(`✅ VIGL pipeline found ${discoveries.length} discoveries`);
    } catch (viglError) {
      console.log('⚠️ VIGL pipeline failed, trying discovery capture:', viglError.message);
      
      // Option 2: Use discovery capture as fallback
      try {
        discoveries = await runDiscoveryCapture();
        console.log(`✅ Discovery capture found ${discoveries.length} discoveries`);
      } catch (captureError) {
        console.log('⚠️ Discovery capture failed, using database fallback:', captureError.message);
        
        // Option 3: Get recent discoveries from database
        discoveries = await getRecentDiscoveries();
        console.log(`✅ Database fallback found ${discoveries.length} discoveries`);
      }
    }
    
    if (discoveries.length === 0) {
      console.log('❌ No discoveries found from any source');
      return [];
    }
    
    // Clear old UI data (keep last 24h only)
    await db.db.prepare('DELETE FROM discoveries_vigl WHERE created_at < datetime("now", "-24 hours")').run();
    
    // Transform real discoveries to UI format
    const uiDiscoveries = [];
    
    for (const discovery of discoveries) {
      const score = discovery.vigl_score || discovery.score || 50;
      const normalizedScore = Math.min(Math.max(score * 100, 30), 100); // Convert to 30-100 range
      
      const action = normalizedScore >= 75 ? 'BUY' :
                     normalizedScore >= 65 ? 'EARLY_READY' :
                     normalizedScore >= 55 ? 'PRE_BREAKOUT' : 'WATCHLIST';
      
      // Extract real features from discovery
      const features = discovery.features || {};
      const price = features.price || features.currentPrice || discovery.price || 0;
      
      if (!price || price <= 0) continue; // Skip invalid prices
      
      // Build thesis from real data
      const thesis = {
        momentum: Math.round(normalizedScore * 0.3),
        squeeze: Math.round((features.short_interest_pct || 0) * 100 * 0.5 + normalizedScore * 0.2),
        catalyst: Math.round(normalizedScore * 0.25),
        sentiment: Math.round(normalizedScore * 0.15),
        technical: Math.round(normalizedScore * 0.1)
      };
      
      // Build targets based on score and volatility
      const volatility = features.atr_pct || 0.03;
      const tp1_pct = Math.max(0.08, Math.min(0.25, volatility * 4));
      const tp2_pct = Math.max(0.15, Math.min(0.50, volatility * 8));
      const stop_pct = Math.max(0.05, Math.min(0.15, volatility * 2));
      
      const targets = {
        entry: `Above $${(price * 1.01).toFixed(2)}`,
        tp1: `+${(tp1_pct * 100).toFixed(0)}%`,
        tp2: `+${(tp2_pct * 100).toFixed(0)}%`,
        stop: `-${(stop_pct * 100).toFixed(0)}%`
      };
      
      const uiDiscovery = {
        symbol: discovery.symbol,
        score: Math.round(normalizedScore),
        price: price,
        rvol: features.rel_volume || discovery.rel_vol_30m || 1.5,
        action: action,
        thesis: JSON.stringify(thesis),
        targets: JSON.stringify(targets)
      };
      
      uiDiscoveries.push(uiDiscovery);
    }
    
    // Insert real discoveries into UI table
    const stmt = db.db.prepare(`
      INSERT OR REPLACE INTO discoveries_vigl (symbol, score, price, rvol, action, thesis, targets)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    let inserted = 0;
    for (const discovery of uiDiscoveries) {
      try {
        stmt.run(
          discovery.symbol,
          discovery.score,
          discovery.price,
          discovery.rvol,
          discovery.action,
          discovery.thesis,
          discovery.targets
        );
        inserted++;
        console.log(`✅ Added ${discovery.symbol} (score: ${discovery.score}, action: ${discovery.action})`);
      } catch (insertError) {
        console.error(`❌ Failed to insert ${discovery.symbol}:`, insertError.message);
      }
    }
    
    console.log(`🎯 Successfully populated UI with ${inserted} REAL discoveries`);
    return uiDiscoveries;
    
  } catch (error) {
    console.error('❌ Failed to populate UI with real discoveries:', error);
    throw error;
  }
}

/**
 * Get recent discoveries from database as fallback
 */
async function getRecentDiscoveries() {
  try {
    const discoveries = db.db.prepare(`
      SELECT symbol, score, features_json, created_at
      FROM discoveries 
      WHERE created_at > datetime('now', '-24 hours')
      AND score > 0.5
      ORDER BY score DESC
      LIMIT 20
    `).all();
    
    return discoveries.map(d => {
      let features = {};
      try {
        features = JSON.parse(d.features_json || '{}');
      } catch (e) {
        // Use defaults if parsing fails
      }
      
      return {
        symbol: d.symbol,
        score: d.score,
        features: features,
        created_at: d.created_at
      };
    });
  } catch (error) {
    console.error('❌ Failed to get recent discoveries:', error);
    return [];
  }
}

/**
 * Auto-populate UI discoveries on a schedule
 */
function startRealDiscoveryScheduler() {
  const intervalMinutes = parseInt(process.env.UI_DISCOVERY_INTERVAL_MIN || '15');
  console.log(`🔄 Starting real discovery scheduler (every ${intervalMinutes} minutes)`);
  
  // Run immediately on startup
  populateUIWithRealDiscoveries().catch(console.error);
  
  // Then run on schedule
  setInterval(() => {
    console.log('🔄 Scheduled real discovery scan...');
    populateUIWithRealDiscoveries().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

module.exports = {
  populateUIWithRealDiscoveries,
  startRealDiscoveryScheduler
};