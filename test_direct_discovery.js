// Direct test of the discovery system with available data
const db = require('./server/db/sqlite');
const shortInterestProvider = require('./server/services/providers/shortinterest');

async function testDirectDiscovery() {
  console.log('🔧 Testing Direct Discovery with Available Data');
  
  // Get the stocks that were scored by the system
  const rawQuery = `
    SELECT symbol, score, action, price, created_at
    FROM discoveries 
    WHERE symbol NOT LIKE 'AUDIT%' 
    AND action IS NULL 
    ORDER BY score DESC 
    LIMIT 10
  `;
  
  const scoredStocks = db.db.prepare(rawQuery).all();
  console.log(`\n📊 Found ${scoredStocks.length} stocks with scores:`);
  
  for (const stock of scoredStocks) {
    console.log(`${stock.symbol}: Score ${stock.score}, Price $${stock.price || 'unknown'}`);
    
    // Check if we have short interest data for this stock
    const shortData = await shortInterestProvider.get(stock.symbol);
    if (shortData) {
      console.log(`  📈 Short Interest: ${shortData.short_interest_pct}%, Days to Cover: ${shortData.days_to_cover}`);
      
      // Manually apply lenient criteria
      const price = stock.price || 0;
      const siPct = shortData.short_interest_pct || 0;
      const dtc = shortData.days_to_cover || 0;
      
      if (price > 0.50 && siPct >= 15 && dtc >= 3) {
        console.log(`  ✅ ${stock.symbol} PASSES lenient criteria - should be a discovery!`);
        
        // Create a manual discovery entry to test
        try {
          await db.insertDiscovery({
            id: `manual-${Date.now()}-${stock.symbol}`,
            symbol: stock.symbol,
            price: price,
            score: stock.score * 20, // Scale up to percentage
            preset: 'manual_test',
            action: stock.score > 4.5 ? 'BUY' : stock.score > 3.5 ? 'WATCHLIST' : 'MONITOR',
            features_json: JSON.stringify({
              short_interest_pct: siPct,
              days_to_cover: dtc,
              technicals: { rel_volume: 1.5, price: price }
            }),
            audit_json: JSON.stringify({
              subscores: { siSub: siPct * 2, dtcSub: dtc * 10 },
              gates: { data_ready: true }
            })
          });
          console.log(`  💾 Created manual discovery for ${stock.symbol}`);
        } catch (err) {
          console.log(`  ❌ Error creating discovery: ${err.message}`);
        }
      } else {
        console.log(`  ❌ ${stock.symbol} fails criteria: price=${price}, si=${siPct}%, dtc=${dtc}`);
      }
    } else {
      console.log(`  ❌ No short interest data for ${stock.symbol}`);
    }
    console.log('');
  }
  
  console.log('\n🎯 Manual discoveries created. Test API endpoints:');
  console.log('curl http://localhost:3001/api/discoveries/top');
}

testDirectDiscovery().catch(console.error);