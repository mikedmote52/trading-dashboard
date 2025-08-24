/**
 * Portfolio Background Worker
 * Manages positions, theses, and alerts based on decisions and market data
 */

const { getDb } = require('../lib/db');

const WORKER_INTERVAL_MS = 30000; // 30 seconds

async function updatePortfolioTheses() {
  const db = getDb();
  await db.initialize();
  
  try {
    // Get all open positions
    const positions = await db.all(`
      SELECT * FROM positions 
      WHERE status = 'open'
    `);
    
    console.log(`[portfolio] Updating theses for ${positions.length} open positions`);
    
    for (const position of positions) {
      // Get latest decision for this symbol
      const decision = await db.get(`
        SELECT * FROM decisions 
        WHERE symbol = $1 
        AND status IN ('executed', 'planned')
        ORDER BY created_at DESC
        LIMIT 1
      `, [position.symbol]);
      
      // Get current thesis
      const currentThesis = await db.get(`
        SELECT * FROM theses 
        WHERE position_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [position.id]);
      
      // Calculate new confidence based on price action
      const priceChange = (position.current_price - position.avg_price) / position.avg_price;
      let newConfidence = currentThesis?.confidence || 75;
      
      if (priceChange > 0.10) {
        newConfidence = Math.min(95, newConfidence + 10);
      } else if (priceChange < -0.05) {
        newConfidence = Math.max(40, newConfidence - 15);
      }
      
      // Check if thesis needs update
      const needsUpdate = !currentThesis || 
        Math.abs(newConfidence - currentThesis.confidence) > 5 ||
        (Date.now() - new Date(currentThesis.created_at).getTime()) > 86400000; // 24 hours
      
      if (needsUpdate) {
        // Create new thesis
        const newThesis = {
          position_id: position.id,
          symbol: position.symbol,
          thesis: decision?.rationale?.thesis || currentThesis?.thesis || 'Position under review',
          confidence: newConfidence,
          risk_level: newConfidence < 50 ? 'high' : newConfidence < 70 ? 'medium' : 'low',
          target_1: decision?.tp1 || currentThesis?.target_1 || position.avg_price * 1.20,
          target_2: decision?.tp2 || currentThesis?.target_2 || position.avg_price * 1.50,
          stop_loss: decision?.stop || currentThesis?.stop_loss || position.avg_price * 0.90
        };
        
        // Insert new thesis
        const result = await db.run(`
          INSERT INTO theses (
            position_id, symbol, thesis, confidence, risk_level,
            target_1, target_2, stop_loss, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        `, [
          newThesis.position_id,
          newThesis.symbol,
          newThesis.thesis,
          newThesis.confidence,
          newThesis.risk_level,
          newThesis.target_1,
          newThesis.target_2,
          newThesis.stop_loss,
          JSON.stringify({ price_change: priceChange })
        ]);
        
        // Record thesis history if there was a previous thesis
        if (currentThesis) {
          await db.run(`
            INSERT INTO thesis_history (
              thesis_id, symbol, old_thesis, new_thesis,
              old_confidence, new_confidence, reason, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          `, [
            result.lastInsertRowid,
            position.symbol,
            currentThesis.thesis,
            newThesis.thesis,
            currentThesis.confidence,
            newThesis.confidence,
            priceChange > 0 ? 'Price momentum positive' : 'Position degrading'
          ]);
        }
        
        console.log(`[portfolio] Updated thesis for ${position.symbol}: confidence ${newConfidence}%`);
        
        // Generate alerts if needed
        if (newConfidence < 50) {
          await generatePortfolioAlert(position, 'EXIT_SIGNAL', 'Thesis confidence below 50%', 'high');
        } else if (newConfidence < 60 && position.unrealized_pnl < 0) {
          await generatePortfolioAlert(position, 'TRIM_POSITION', 'Consider reducing position size', 'medium');
        } else if (newConfidence > 85 && position.unrealized_pnl > 0) {
          await generatePortfolioAlert(position, 'SCALE_IN', 'Strong thesis - consider adding', 'low');
        }
      }
    }
    
  } catch (err) {
    console.error('[portfolio] Error updating theses:', err.message);
  }
}

async function generatePortfolioAlert(position, alertType, message, severity) {
  const db = getDb();
  
  try {
    // Check for recent similar alert
    const recentAlert = await db.get(`
      SELECT id FROM portfolio_alerts 
      WHERE symbol = $1 
      AND alert_type = $2 
      AND acknowledged = false
      AND created_at > datetime('now', '-6 hours')
    `, [position.symbol, alertType]);
    
    if (recentAlert) {
      return; // Don't duplicate alerts
    }
    
    // Generate action suggestion based on alert type
    let actionSuggested = '';
    switch (alertType) {
      case 'EXIT_SIGNAL':
        actionSuggested = `Close position at market. Current P&L: ${position.unrealized_pnl}`;
        break;
      case 'TRIM_POSITION':
        actionSuggested = `Reduce position by 50%. Current size: ${position.quantity}`;
        break;
      case 'SCALE_IN':
        actionSuggested = `Add 25% to position. Current size: ${position.quantity}`;
        break;
      default:
        actionSuggested = 'Review position';
    }
    
    // Insert alert
    await db.run(`
      INSERT INTO portfolio_alerts (
        symbol, alert_type, message, severity, 
        action_suggested, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [
      position.symbol,
      alertType,
      message,
      severity,
      actionSuggested,
      JSON.stringify({
        position_id: position.id,
        current_price: position.current_price,
        avg_price: position.avg_price,
        unrealized_pnl: position.unrealized_pnl
      })
    ]);
    
    console.log(`[portfolio] Alert generated for ${position.symbol}: ${alertType} - ${message}`);
    
  } catch (err) {
    console.error('[portfolio] Error generating alert:', err.message);
  }
}

async function syncDecisionsToPositions() {
  const db = getDb();
  await db.initialize();
  
  try {
    // Get executed decisions that don't have positions
    const executedDecisions = await db.all(`
      SELECT d.* FROM decisions d
      LEFT JOIN positions p ON d.symbol = p.symbol AND p.status = 'open'
      WHERE d.status = 'executed'
      AND p.id IS NULL
    `);
    
    for (const decision of executedDecisions) {
      // Create position record
      await db.run(`
        INSERT INTO positions (
          symbol, quantity, avg_price, current_price,
          unrealized_pnl, realized_pnl, status, 
          opened_at, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      `, [
        decision.symbol,
        100, // Default quantity
        decision.entry,
        decision.entry,
        0,
        0,
        'open',
        new Date().toISOString(),
        JSON.stringify({ decision_id: decision.id })
      ]);
      
      console.log(`[portfolio] Created position for ${decision.symbol} from executed decision`);
    }
    
  } catch (err) {
    console.error('[portfolio] Error syncing decisions:', err.message);
  }
}

async function startPortfolioWorker() {
  console.log('[portfolio] Starting portfolio background worker...');
  
  // Initial run
  await updatePortfolioTheses();
  await syncDecisionsToPositions();
  
  // Schedule periodic runs
  setInterval(async () => {
    await updatePortfolioTheses();
    await syncDecisionsToPositions();
  }, WORKER_INTERVAL_MS);
}

module.exports = {
  updatePortfolioTheses,
  generatePortfolioAlert,
  syncDecisionsToPositions,
  startPortfolioWorker
};