const db = require('./server/db/sqlite');

async function debugActions() {
  console.log('Checking for records with actions in database...');
  
  // Check for any records with non-null actions
  const withActions = db.db.prepare(`
    SELECT symbol, score, action, created_at 
    FROM discoveries 
    WHERE action IS NOT NULL 
    AND symbol NOT LIKE 'AUDIT%'
    ORDER BY created_at DESC 
    LIMIT 5
  `).all();
  
  console.log(`Found ${withActions.length} records with actions:`);
  withActions.forEach(r => {
    console.log(`  ${r.symbol}: ${r.action} (score: ${r.score}) - ${r.created_at}`);
  });
  
  // Check for null actions
  const withoutActions = db.db.prepare(`
    SELECT symbol, score, action, created_at 
    FROM discoveries 
    WHERE action IS NULL 
    AND symbol NOT LIKE 'AUDIT%'
    ORDER BY created_at DESC 
    LIMIT 5
  `).all();
  
  console.log(`\nFound ${withoutActions.length} records WITHOUT actions:`);
  withoutActions.forEach(r => {
    console.log(`  ${r.symbol}: null (score: ${r.score}) - ${r.created_at}`);
  });
  
  // Check BMI specifically
  const bmi = db.db.prepare(`
    SELECT symbol, score, action, created_at 
    FROM discoveries 
    WHERE symbol = 'BMI'
    ORDER BY created_at DESC 
    LIMIT 1
  `).get();
  
  if (bmi) {
    console.log(`\nBMI record: ${bmi.action} (score: ${bmi.score}) - ${bmi.created_at}`);
  } else {
    console.log('\nNo BMI record found in database');
  }
}

debugActions().catch(console.error);