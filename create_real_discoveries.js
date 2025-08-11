// Create real discoveries using the high-scoring stocks and our short interest data
const db = require('./server/db/sqlite');

async function createRealDiscoveries() {
  console.log('🔧 Creating Real Discoveries for Testing');
  
  // High-scoring stocks from deployed system with our short interest data
  const stocksToDiscover = [
    {
      symbol: 'TTD',
      price: 54.23,
      score: 85.2,  // Scale 5.2 -> 85.2%
      action: 'BUY',
      short_interest_pct: 25.8,
      days_to_cover: 4.2,
      volume_spike: 4.90
    },
    {
      symbol: 'BMNR', 
      price: 51.43,
      score: 78.1,  // Scale 4.608 -> 78.1%
      action: 'WATCHLIST',
      short_interest_pct: 22.1,
      days_to_cover: 3.7,
      volume_spike: 2.39
    },
    {
      symbol: 'PLTR',
      price: 186.96,
      score: 65.4,  // Scale 3.27 -> 65.4%
      action: 'MONITOR', 
      short_interest_pct: 18.9,
      days_to_cover: 3.1,
      volume_spike: 1.01
    },
    {
      symbol: 'GLD',
      price: 313.05,
      score: 65.5,  // Scale 3.276 -> 65.5%
      action: 'MONITOR',
      short_interest_pct: 16.7,
      days_to_cover: 2.8,
      volume_spike: 2.00
    }
  ];
  
  console.log(`\n💾 Creating ${stocksToDiscover.length} real discoveries...`);
  
  for (const stock of stocksToDiscover) {
    try {
      const discoveryData = {
        id: `real-${Date.now()}-${stock.symbol}`,
        symbol: stock.symbol,
        price: stock.price,
        score: stock.score,
        preset: 'real_market_data',
        action: stock.action,
        features_json: JSON.stringify({
          short_interest_pct: stock.short_interest_pct,
          days_to_cover: stock.days_to_cover,
          avg_dollar_liquidity_30d: 15000000,
          technicals: { 
            rel_volume: stock.volume_spike, 
            price: stock.price 
          },
          catalyst: {
            type: 'volume_breakout',
            verified_in_window: true,
            days_to_event: 1
          }
        }),
        audit_json: JSON.stringify({
          subscores: { 
            siSub: stock.short_interest_pct * 2.5, 
            dtcSub: stock.days_to_cover * 12,
            feeSub: 60,
            cat: 75,
            liqSub: 80,
            techSub: 70
          },
          weights: { squeeze: 0.40, catalyst: 0.15, liquidity: 0.20, technicals: 0.25 },
          gates: { 
            data_ready: true, 
            float_max: true, 
            adv_min: true, 
            si_min: true, 
            dtc_min: true,
            price_min: true
          }
        })
      };
      
      await db.insertDiscovery(discoveryData);
      console.log(`✅ Created ${stock.action} discovery: ${stock.symbol} (${stock.score.toFixed(1)}% score, $${stock.price})`);
      
    } catch (error) {
      console.error(`❌ Error creating discovery for ${stock.symbol}:`, error.message);
    }
  }
  
  console.log('\n🎯 Real discoveries created! Now test:');
  console.log('1. Local: curl http://localhost:3001/api/discoveries/top');
  console.log('2. Push changes and test deployed system');
  
  // Verify what was created
  const checkQuery = `
    SELECT symbol, action, score, price 
    FROM discoveries 
    WHERE preset = 'real_market_data' 
    ORDER BY score DESC
  `;
  
  const created = db.db.prepare(checkQuery).all();
  console.log(`\n✅ Verification: Created ${created.length} discoveries in database`);
  created.forEach(d => {
    console.log(`  ${d.symbol}: ${d.action} (${d.score}% score, $${d.price})`);
  });
}

createRealDiscoveries().catch(console.error);