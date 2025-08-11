const db = require('./server/db/sqlite');

async function checkDatabaseRecords() {
  console.log('Analyzing database records for actionable candidates...');
  
  // Check if we have any non-audit records
  const stockRecords = db.db.prepare(`
    SELECT symbol, score, action, created_at, features_json
    FROM discoveries 
    WHERE symbol NOT LIKE 'AUDIT%'
    ORDER BY created_at DESC 
    LIMIT 10
  `).all();
  
  console.log(`Found ${stockRecords.length} non-audit records`);
  
  if (stockRecords.length > 0) {
    console.log('Recent stock records:');
    for (const record of stockRecords) {
      console.log(`  ${record.symbol}: score=${record.score}, action=${record.action || 'null'}`);
      
      // Check if this record has the data needed
      if (record.features_json) {
        try {
          const features = JSON.parse(record.features_json);
          console.log(`    SI: ${features.short_interest_pct || 'null'}, DTC: ${features.days_to_cover || 'null'}`);
          console.log(`    Float: ${features.float_shares || 'null'}, BorrowFee: ${features.borrow_fee_pct || 'null'}`);
        } catch (e) {
          console.log('    Could not parse features JSON');
        }
      }
    }
  }
  
  // Check what scores exist in database
  const scoreStats = db.db.prepare(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN score >= 80 THEN 1 END) as buy_range,
      COUNT(CASE WHEN score >= 60 AND score < 80 THEN 1 END) as watchlist_range,
      COUNT(CASE WHEN score >= 40 AND score < 60 THEN 1 END) as monitor_range,
      COUNT(CASE WHEN score < 40 THEN 1 END) as no_action_range,
      MAX(score) as max_score,
      MIN(score) as min_score
    FROM discoveries 
    WHERE symbol NOT LIKE 'AUDIT%'
  `).get();
  
  console.log('\nScore distribution in database:');
  console.log('Total records:', scoreStats.total);
  console.log('BUY range (≥80):', scoreStats.buy_range);
  console.log('WATCHLIST range (60-79):', scoreStats.watchlist_range);
  console.log('MONITOR range (40-59):', scoreStats.monitor_range);
  console.log('NO ACTION range (<40):', scoreStats.no_action_range);
  console.log('Score range:', scoreStats.min_score, 'to', scoreStats.max_score);
}

checkDatabaseRecords().catch(console.error);