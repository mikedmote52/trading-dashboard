const db = require('./server/db/sqlite');

console.log('Checking score distribution in database...');

// Get score statistics
const stats = db.db.prepare(`
  SELECT 
    COUNT(*) as total_records,
    MIN(score) as min_score,
    MAX(score) as max_score,
    AVG(score) as avg_score
  FROM discoveries 
  WHERE symbol NOT LIKE 'AUDIT%'
`).get();

console.log('Score statistics:', stats);

// Get top 10 scores
const topScores = db.db.prepare(`
  SELECT symbol, score, action, created_at 
  FROM discoveries 
  WHERE symbol NOT LIKE 'AUDIT%' 
  ORDER BY score DESC 
  LIMIT 10
`).all();

console.log('\nTop 10 scores:');
topScores.forEach(r => {
  console.log(`  ${r.symbol}: ${r.score} (action: ${r.action || 'null'}) - ${r.created_at}`);
});

// Check how many records fall into each action range
const ranges = [
  { name: 'BUY (≥5.0)', min: 5.0, max: 100 },
  { name: 'WATCHLIST (3.0-4.99)', min: 3.0, max: 4.99 },
  { name: 'MONITOR (2.0-2.99)', min: 2.0, max: 2.99 },
  { name: 'NO ACTION (<2.0)', min: 0, max: 1.99 }
];

console.log('\nScore range distribution:');
for (const range of ranges) {
  const count = db.db.prepare(`
    SELECT COUNT(*) as count 
    FROM discoveries 
    WHERE symbol NOT LIKE 'AUDIT%' 
    AND score >= ? AND score <= ?
  `).get(range.min, range.max);
  
  console.log(`  ${range.name}: ${count.count} records`);
}