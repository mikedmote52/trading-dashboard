const fs = require('fs');
const path = require('path');

async function saveScoresAtomically(items, metadata = {}) {
  if (!items || items.length === 0) return 0;
  
  const dbPath = path.join(process.cwd(), 'trading_dashboard.db');
  if (!fs.existsSync(dbPath)) return 0;
  
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Clear existing latest_scores for atomic replacement
      db.run('DELETE FROM latest_scores', (err) => {
        if (err) {
          db.run('ROLLBACK');
          db.close();
          return reject(err);
        }
        
        let inserted = 0;
        let pending = items.length;
        let hasError = false;
        
        items.forEach((item) => {
          const stmt = db.prepare(`
            INSERT INTO latest_scores 
            (ticker, score, price, current_price, thesis, engine, run_id, snapshot_ts, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);
          
          stmt.run([
            item.ticker,
            item.score || 70,
            item.price || 0,
            item.price || 0,
            item.thesis || `Discovery score: ${item.score || 70}`,
            metadata.engine || 'screener_live',
            metadata.run_id || `run_${Date.now()}`,
            metadata.snapshot_ts || new Date().toISOString()
          ], (err) => {
            pending--;
            if (err && !hasError) {
              hasError = true;
              db.run('ROLLBACK');
              db.close();
              return reject(err);
            }
            
            if (!hasError) {
              inserted++;
            }
            
            if (pending === 0 && !hasError) {
              db.run('COMMIT', (commitErr) => {
                db.close();
                if (commitErr) reject(commitErr);
                else resolve(inserted);
              });
            }
          });
          
          stmt.finalize();
        });
      });
    });
  });
}

module.exports = { saveScoresAtomically };