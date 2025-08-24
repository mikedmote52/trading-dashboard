/**
 * Decisions Generator Worker
 * Scans contenders with score >= 75 and generates trading decisions
 */

const { getDb } = require('../lib/db');
const { flag } = require('../lib/envFlags');

const DECISION_THRESHOLD = 75;
const REFRESH_INTERVAL_MS = 60000; // 1 minute

async function generateDecisions() {
  const db = getDb();
  await db.initialize();
  
  try {
    // Get high-scoring contenders
    const contenders = await db.all(`
      SELECT * FROM contenders 
      WHERE score >= $1
      ORDER BY score DESC
    `, [DECISION_THRESHOLD]);
    
    console.log(`[decisions] Found ${contenders.length} contenders with score >= ${DECISION_THRESHOLD}`);
    
    for (const contender of contenders) {
      // Check if decision already exists
      const existing = await db.get(`
        SELECT id FROM decisions 
        WHERE ticker = $1
      `, [contender.ticker]);
      
      if (existing) {
        console.log(`[decisions] Decision already exists for ${contender.ticker}`);
        continue;
      }
      
      // Generate decision based on contender data
      const entry = Number(contender.price || 0);
      const stop = entry * 0.90; // 10% stop loss
      const tp1 = entry * 1.20;  // 20% first target
      const tp2 = entry * 1.50;  // 50% second target
      
      const rationale = {
        score: contender.score,
        confidence: contender.confidence,
        thesis: contender.thesis,
        reasons: contender.reasons || [],
        subscores: contender.subscores || {},
        technical: {
          entry_type: 'MOMENTUM',
          support: stop,
          resistance: [tp1, tp2]
        }
      };
      
      const sizePlan = {
        initial: 100,
        scale_add: contender.score >= 85 ? 150 : 50,
        max_position: 500,
        conditions: {
          add_on_volume: true,
          add_on_score_maintain: contender.score >= 75
        }
      };
      
      // Insert decision
      await db.run(`
        INSERT INTO decisions (
          ticker, action, score, confidence, thesis,
          entry_price, stop_price, tp1_price, tp2_price, 
          size_plan, rationale, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      `, [
        contender.ticker,
        'BUY CANDIDATE',
        contender.score,
        contender.confidence || contender.score,
        contender.thesis,
        entry,
        stop,
        tp1,
        tp2,
        sizePlan,
        rationale
      ]);
      
      console.log(`[decisions] Generated decision for ${contender.ticker}: Entry=${entry}, Stop=${stop}, TP1=${tp1}, TP2=${tp2}`);
    }
    
    // Clean up old decisions (Postgres syntax)
    const cleanupCount = await db.run(`
      DELETE FROM decisions 
      WHERE created_at < NOW() - INTERVAL '7 days'
      AND ticker NOT IN (SELECT ticker FROM positions WHERE status = 'active')
    `);
    
    if (cleanupCount?.changes > 0) {
      console.log(`[decisions] Cleaned up ${cleanupCount.changes} old decisions`);
    }
    
  } catch (err) {
    console.error('[decisions] Error generating decisions:', err.message);
  }
}

async function startDecisionsGenerator() {
  console.log('[decisions] Starting decisions generator worker...');
  
  // Initial run
  await generateDecisions();
  
  // Schedule periodic runs
  setInterval(async () => {
    await generateDecisions();
  }, REFRESH_INTERVAL_MS);
}

// API endpoint handler
async function getLatestDecisions(req, res) {
  try {
    const db = getDb();
    await db.initialize();
    
    const limit = parseInt(req.query.limit) || 10;
    
    const decisions = await db.all(`
      SELECT d.*, c.score as current_score
      FROM decisions d
      LEFT JOIN contenders c ON d.ticker = c.ticker
      ORDER BY d.created_at DESC
      LIMIT $1
    `, [limit]);
    
    // Parse JSON fields
    const formatted = decisions.map(d => ({
      ...d,
      size_plan: typeof d.size_plan === 'string' ? JSON.parse(d.size_plan) : d.size_plan,
      rationale: typeof d.rationale === 'string' ? JSON.parse(d.rationale) : d.rationale
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error('[decisions] Error fetching decisions:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  generateDecisions,
  startDecisionsGenerator,
  getLatestDecisions
};