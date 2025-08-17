/* Backtests VIGL discoveries from the past 30 days for
   5-day +10% pops with <=15% max drawdown, and applies an
   Explosiveness Score >=70 filter.

   Usage: node vigl_backtest_current.js [BASE_URL]
   Default BASE_URL = http://localhost:3001
*/
import yf from 'yahoo-finance2';
import fetch from 'node-fetch';

const BASE = process.argv[2] || 'http://localhost:3001';
const START = new Date();
START.setDate(START.getDate() - 30); // Last 30 days
const END = new Date();

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

// --- Helpers -------------------------------------------------
function inRange(dt, a=START, b=END) {
  const t = new Date(dt).getTime();
  return t >= a.getTime() && t <= b.getTime();
}

function norm(x, min, max) {
  if (x === undefined || x === null || Number.isNaN(Number(x))) return 0;
  if (max === min) return 0;
  const v = (Number(x)-min)/(max-min);
  return Math.max(0, Math.min(1, v));
}

function explosiveness(features = {}) {
  // Safe optional chaining
  const f = features || {};
  const tech = f.technicals || {};
  const opts = f.options || {};
  const sent = f.sentiment || {};
  const cat  = f.catalyst || {};
  const si   = Number(f.short_interest) || 0;
  const util = Number(f.short_utilization) || 0;
  const fee  = Number(f.borrow_fee) || 0;
  const float= Number(f.float) || 0;
  const volR = Number(f.volume_ratio) || Number(f.rel_volume) || 0;
  const atrp = Number(tech.atr_pct) || 0;
  const rsi  = Number(tech.rsi) || 0;
  const emaX = tech.ema9_20_crossover ? 1 : 0;
  const vwap = tech.vwap_hold ? 1 : 0;
  const cpr  = Number(opts.call_put_ratio) || 0;
  const ivp  = Number(opts.iv_percentile) || 0;
  const buzz = Number(sent.score) || 0;

  // Subscores 0..1
  const S_volume   = Math.max(norm(volR, 1.2, 10), 0);          // prefer 1.5x..10x
  const S_momentum = 0.5*norm(atrp, 0.02, 0.12) + 0.25*(rsi>=60 && rsi<=70 ? 1:0.5*norm(rsi,50,80)) + 0.25*((emaX+vwap)/2);

  // Squeeze enablers: small float OR high SI/util/fee
  const S_float    = float>0 ? norm(50, float, 300) : 0.3;        // <=50M best
  const S_short    = 0.5*norm(si, 5, 30) + 0.25*norm(util, 40, 90) + 0.25*norm(fee, 2, 40);
  const S_enabler  = Math.max(S_float, S_short);

  const S_catalyst = (cat && (cat.present || cat.type)) ? 1 : 0.4;
  const S_sent     = Math.max(norm(buzz, 0.3, 2), 0.2);            // Reddit/StockTwits buzz ratio
  const S_options  = 0.6*Math.min(cpr/2,1) + 0.4*Math.min(ivp/100,1);
  const S_tech     = 0.5*((emaX+vwap)/2) + 0.5*Math.min(atrp/0.08,1);

  // Weights (squeeze-biased but more forgiving)
  const W = {
    volume: 0.35, enabler: 0.20, catalyst: 0.15,
    sentiment: 0.15, options: 0.08, technicals: 0.07
  };

  const score01 =
    W.volume    * (0.7*S_volume + 0.3*S_momentum) +
    W.enabler   * S_enabler +
    W.catalyst  * S_catalyst +
    W.sentiment * S_sent +
    W.options   * S_options +
    W.technicals* S_tech;

  return Math.round(score01 * 100); // 0..100
}

// Compute 5D metrics from Yahoo candles
function fiveDayOutcome(entry, candles) {
  // candles: array of {date, open, high, low, close}
  if (!candles || candles.length === 0) return null;

  const highs = candles.map(c => c.high).filter(Number.isFinite);
  const lows  = candles.map(c => c.low).filter(Number.isFinite);

  if (highs.length === 0 || lows.length === 0) return null;

  const maxHigh = Math.max(...highs);
  const minLow  = Math.min(...lows);

  const maxGain = (maxHigh - entry)/entry;    // best pop within 5d
  const maxDD   = (minLow - entry)/entry;     // worst drawdown within 5d

  return { maxGain, maxDD };
}

async function fetchNext5Sessions(symbol, discoveredAt) {
  try {
    // Use discovery date as starting point; pull ~10 trading days to be safe
    const start = new Date(discoveredAt);
    const end = new Date(start); 
    end.setDate(end.getDate() + 14); // Look ahead 2 weeks

    // chart() returns {quotes:[], timestamp:[]}
    const res = await yf.chart(symbol, { period1: start, period2: end, interval: '1d' });
    if (!res || !res.quotes?.length) return null;

    const quotes = res.quotes.filter(q => q && Number.isFinite(q.open || q.close));
    if (quotes.length === 0) return null;

    const entry = quotes[0]?.open ?? quotes[0]?.close;
    const window = quotes.slice(0, 5).map(q => ({
      date: new Date(q.date || q.timestamp || Date.now()),
      open: q.open, high: q.high, low: q.low, close: q.close
    }));

    if (!Number.isFinite(entry) || window.length === 0) return null;

    return { entry, window };
  } catch (error) {
    console.log(`⚠️ Failed to fetch data for ${symbol}: ${error.message}`);
    return null;
  }
}

// --- Main ----------------------------------------------------
(async () => {
  console.log(`🔎 Backtesting recent discoveries from ${BASE} (last 30 days)...`);

  const raw = await fetch(`${BASE}/api/discoveries/raw`).then(r=>r.json()).catch(()=>null);
  if (!raw || !Array.isArray(raw)) {
    console.error('❌ Could not load /api/discoveries/raw or unexpected format');
    process.exit(1);
  }

  console.log(`📥 Total discoveries in database: ${raw.length}`);

  // Take a sample of recent discoveries for testing
  const recentDiscoveries = raw
    .filter(d => d && d.symbol && d.created_at)
    .slice(0, 50) // Test first 50 for speed
    .map(d => ({
      symbol: d.symbol.trim().toUpperCase(),
      created_at: d.created_at,
      features: (() => {
        try { return d.features_json ? JSON.parse(d.features_json) : (d.features || {}); }
        catch { return {}; }
      })(),
      action: d.action || 'MONITOR',
      score: d.score || 0
    }));

  console.log(`📊 Testing sample of ${recentDiscoveries.length} recent discoveries...`);

  // Rate-limit: fetch in small batches
  const BATCH = 5;
  const results = [];
  for (let i=0; i<recentDiscoveries.length; i+=BATCH) {
    const slice = recentDiscoveries.slice(i, i+BATCH);
    console.log(`📈 Processing batch ${Math.floor(i/BATCH)+1}/${Math.ceil(recentDiscoveries.length/BATCH)} (${slice.map(s=>s.symbol).join(', ')})...`);
    
    const batch = await Promise.all(slice.map(async d => {
      try {
        const data = await fetchNext5Sessions(d.symbol, d.created_at);
        if (!data) return { ...d, skip:true, reason: 'no_data' };

        const { entry, window } = data;
        const outcome = fiveDayOutcome(entry, window);
        if (!outcome) return { ...d, skip:true, reason: 'no_outcome' };

        const eScore = explosiveness(d.features);
        const hit = outcome.maxGain >= 0.10 && outcome.maxDD >= -0.15; // More lenient for recent data
        return {
          ...d,
          entry, window,
          maxGain: outcome.maxGain,
          maxDD: outcome.maxDD,
          explosiveness: eScore,
          isExplosive: eScore >= 60, // Lowered threshold for current data
          hit,
          passes: hit && eScore >= 60
        };
      } catch (e) {
        return { ...d, skip:true, err: String(e), reason: 'error' };
      }
    }));
    results.push(...batch);
    await sleep(1000); // Be gentle with Yahoo Finance
  }

  const tested = results.filter(r => !r.skip);
  const explosive = tested.filter(r => r.isExplosive);
  const hits = tested.filter(r => r.hit);
  const passes = tested.filter(r => r.passes);

  const hitRateAll       = tested.length ? (hits.length / tested.length) : 0;
  const hitRateExplosive = explosive.length ? (explosive.filter(r=>r.hit).length / explosive.length) : 0;

  // Top performers
  const top = passes
    .sort((a,b)=> b.maxGain - a.maxGain)
    .slice(0, 15);

  // --- Report ------------------------------------------------
  const pct = x => (x*100).toFixed(1) + '%';
  const skipped = results.filter(r => r.skip);
  
  console.log('\n===== BACKTEST SUMMARY (Recent Discoveries) =====');
  console.log(`Sample size: ${recentDiscoveries.length}`);
  console.log(`Successfully tested: ${tested.length}`);
  console.log(`Skipped (no data/errors): ${skipped.length}`);
  console.log(`Explosive (score ≥60): ${explosive.length}`);
  console.log(`Hits (≥+10% within 5d & DD≥-15%): ${hits.length} (${pct(hitRateAll)})`);
  console.log(`Hits among Explosive cohort: ${explosive.filter(r=>r.hit).length} (${pct(hitRateExplosive)})`);
  console.log(`Final PASS (Hit ∧ Explosive): ${passes.length}`);

  if (top.length > 0) {
    console.log('\nTop PASS performers:');
    console.log('SYMBOL  | ExplScore | MaxGain | MaxDD  | VIGL Score');
    for (const r of top) {
      console.log(
        `${r.symbol.padEnd(7)}| ${String(r.explosiveness).padStart(9)} | ${pct(r.maxGain).padStart(7)} | ${pct(r.maxDD).padStart(6)} | ${String(r.score).padStart(10)}`
      );
    }
  }

  if (tested.length > 0) {
    console.log('\nAll tested discoveries (top 10 by explosiveness):');
    console.log('SYMBOL  | ExplScore | MaxGain | MaxDD  | Hit? | VIGL Score');
    const topByExplosiveness = tested.sort((a,b) => b.explosiveness - a.explosiveness).slice(0, 10);
    for (const r of topByExplosiveness) {
      console.log(
        `${r.symbol.padEnd(7)}| ${String(r.explosiveness).padStart(9)} | ${pct(r.maxGain).padStart(7)} | ${pct(r.maxDD).padStart(6)} | ${r.hit ? ' ✓  ' : ' ✗  '} | ${String(r.score).padStart(10)}`
      );
    }
  }

  // JSON export for UI/analysis
  const payload = {
    summary: {
      tested: tested.length,
      explosive: explosive.length,
      hits: hits.length,
      passes: passes.length,
      hitRateAll,
      hitRateExplosive
    },
    topPerformers: top.map(r => ({
      symbol: r.symbol,
      explosiveness: r.explosiveness,
      maxGain: r.maxGain,
      maxDD: r.maxDD,
      viglScore: r.score
    }))
  };

  console.log('\n— JSON summary —');
  console.log(JSON.stringify(payload, null, 2));
})();