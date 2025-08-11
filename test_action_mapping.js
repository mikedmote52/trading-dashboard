const ActionMapper = require('./server/services/squeeze/action_mapper');
const { loadConfig } = require('./server/services/squeeze/util/config');
const db = require('./server/db/sqlite');

async function testActionMapping() {
  console.log('Testing ActionMapper with existing database records...');
  
  const cfg = loadConfig();
  const mapper = new ActionMapper(cfg);
  
  // Get some records with scores >= 2.0 from database
  const records = db.db.prepare(`
    SELECT symbol, score, action, features_json, created_at 
    FROM discoveries 
    WHERE score >= 2.0 
    ORDER BY score DESC 
    LIMIT 10
  `).all();
  
  console.log(`Found ${records.length} records with scores >= 2.0`);
  
  if (records.length === 0) {
    console.log('No records with scores >= 2.0, checking all records...');
    const allRecords = db.db.prepare(`
      SELECT symbol, score, action, created_at 
      FROM discoveries 
      WHERE symbol NOT LIKE 'AUDIT%'
      ORDER BY score DESC 
      LIMIT 10
    `).all();
    
    console.log('Top 10 scores in database:');
    allRecords.forEach(r => {
      console.log(`  ${r.symbol}: ${r.score} (action: ${r.action || 'null'})`);
    });
    return;
  }
  
  // Test ActionMapper on these records
  for (const record of records) {
    let technicals = {};
    try {
      if (record.features_json) {
        const features = JSON.parse(record.features_json);
        technicals = features.technicals || {};
      }
    } catch (e) {
      console.log(`  Failed to parse features for ${record.symbol}`);
    }
    
    const newAction = mapper.map(record.score, technicals);
    console.log(`${record.symbol}: score=${record.score}, current_action=${record.action || 'null'}, should_be=${newAction}`);
  }
}

testActionMapping().catch(console.error);