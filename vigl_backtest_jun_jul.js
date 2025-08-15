/* Backtests VIGL discoveries (2024-06-01..2024-07-04) for
   5-day +20% pops with <=10% max drawdown, and applies an
   Explosiveness Score >=85 filter.

   Usage: node vigl_backtest_jun_jul.js [BASE_URL]
   Default BASE_URL = http://localhost:3001
*/
import yf from 'yahoo-finance2';
import fetch from 'node-fetch';

const BASE = process.argv[2] || 'http://localhost:3001';
const START = new Date('2024-06-01T00:00:00Z');
const END   = new Date('2024-07-04T23:59:59Z');

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
  const volR = Number(f.volume_ratio) || 0;
  const atrp = Number(tech.atr_pct) || 0;
  const rsi  = Number(tech.rsi) || 0;
  const emaX = tech.ema9_20_crossover ? 1 : 0;
  const vwap = tech.vwap_hold ? 1 : 0;
  const cpr  = Number(opts.call_put_ratio) || 0;
  const ivp  = Number(opts.iv_percentile) || 0;
  const buzz = Number(sent.score) || 0;

  // Subscores 0..1
  const S_volume   = Math.max(norm(volR, 1.5, 20), 0);          // prefer 3x..20x
  const S_momentum = 0.5*norm(atrp, 0.02, 0.12) + 0.25*(rsi>=60 && rsi<=70 ? 1:0.5*norm(rsi,50,80)) + 0.25*((emaX+vwap)/2);

  // Squeeze enablers: small float OR high SI/util/fee
  const S_float    = float>0 ? norm(50, float, 300) : 0;        // <=50M best
  const S_short    = 0.5*norm(si, 10, 40) + 0.25*norm(util, 60, 100) + 0.25*norm(fee, 5, 60);
  const S_enabler  = Math.max(S_float, S_short);

  const S_catalyst = (cat && (cat.present || cat.type)) ? 1 : 0.2;
  const S_sent     = Math.max(norm(buzz, 0.3, 2), 0);            // Reddit/StockTwits buzz ratio
  const S_options  = 0.6*Math.min(cpr/2,1) + 0.4*Math.min(ivp/100,1);
  const S_tech     = 0.5*((emaX+vwap)/2) + 0.5*Math.min(atrp/0.08,1);

  // Weights (squeeze-biased)
  const W = {
    volume: 0.30, enabler: 0.25, catalyst: 0.20,
    sentiment: 0.15, options: 0.05, technicals: 0.05
  };

  const score01 =
    W.volume    * (0.6*S_volume + 0.4*S_momentum) +
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

  const maxHigh = Math.max(...highs);
  const minLow  = Math.min(...lows);

  const maxGain = (maxHigh - entry)/entry;    // best pop within 5d
  const maxDD   = (minLow - entry)/entry;     // worst drawdown within 5d

  return { maxGain, maxDD };
}

async function fetchNext5Sessions(symbol, discoveredAt) {
  // Use next day open as execution; pull ~7 trading days to be safe
  const start = new Date(discoveredAt);
  start.setDate(start.getDate() + 1);
  const end = new Date(start); end.setDate(end.getDate() + 10);

  // chart() returns {quotes:[], timestamp:[]}
  const res = await yf.chart(symbol, { period1: start, period2: end, interval: '1d' }).catch(()=>null);
  if (!res || !res.quotes?.length) return null;

  const quotes = res.quotes;
  const entry = quotes[0]?.open ?? quotes[0]?.close;
  const window = quotes.slice(0, 5).map(q => ({
    date: new Date(q.date || q.timestamp || Date.now()),
    open: q.open, high: q.high, low: q.low, close: q.close
  }));

  if (!Number.isFinite(entry) || window.length === 0) return null;

  return { entry, window };
}

// --- Main ----------------------------------------------------
(async () => {
  console.log(`🔎 Backtesting discoveries from ${BASE} between 2024-06-01 and 2024-07-04 …`);

  const raw = await fetch(`${BASE}/api/discoveries/raw`).then(r=>r.json()).catch(()=>null);
  if (!raw || !Array.isArray(raw)) {
    console.error('❌ Could not load /api/discoveries/raw or unexpected format');
    process.exit(1);
  }

  // Normalize payloads
  const rows = raw
    .filter(d => d && d.symbol && d.created_at && inRange(d.created_at))
    .map(d => ({
      symbol: d.symbol.trim().toUpperCase(),
      created_at: d.created_at,
      features: (() => {
        try { return d.features_json ? JSON.parse(d.features_json) : (d.features || {}); }
        catch { return {}; }
      })(),
      action: d.action || 'MONITOR'
    }));

  console.log(`📥 Candidates in window: ${rows.length}`);

  // De-dup (prefer most recent per symbol/day)
  const key = (s, day) => `${s}::${new Date(day).toISOString().slice(0,10)}`;
  const map = new Map();
  for (const r of rows) {
    const k = key(r.symbol, r.created_at);
    if (!map.has(k)) map.set(k, r);
  }
  const deduped = [...map.values()];
  console.log(`🧹 After de-dup: ${deduped.length}`);

  // Rate-limit: fetch in small batches
  const BATCH = 8;
  const results = [];
  for (let i=0; i<deduped.length; i+=BATCH) {
    const slice = deduped.slice(i, i+BATCH);
    const batch = await Promise.all(slice.map(async d => {
      try {
        const data = await fetchNext5Sessions(d.symbol, d.created_at);
        if (!data) return { ...d, skip:true };

        const { entry, window } = data;
        const outcome = fiveDayOutcome(entry, window);
        if (!outcome) return { ...d, skip:true };

        const eScore = explosiveness(d.features);
        const hit = outcome.maxGain >= 0.20 && outcome.maxDD >= -0.10;
        return {
          ...d,
          entry, window,
          maxGain: outcome.maxGain,
          maxDD: outcome.maxDD,
          explosiveness: eScore,
          isExplosive: eScore >= 85,
          hit,
          passes: hit && eScore >= 85
        };
      } catch (e) {
        return { ...d, skip:true, err: String(e) };
      }
    }));
    results.push(...batch);
    await sleep(250); // gentle
    if (i % (BATCH*5) === 0) console.log(`📊 Processed ${Math.min(i+BATCH, deduped.length)}/${deduped.length} signals...`);
  }

  const tested = results.filter(r => !r.skip);
  const explosive = tested.filter(r => r.isExplosive);
  const passes = tested.filter(r => r.passes);

  const hitRateAll       = tested.length ? (tested.filter(r=>r.hit).length / tested.length) : 0;
  const hitRateExplosive = explosive.length ? (explosive.filter(r=>r.hit).length / explosive.length) : 0;

  // Aggregation per symbol (best occurrence)
  const bySymbol = new Map();
  for (const r of passes) {
    const prev = bySymbol.get(r.symbol);
    if (!prev || r.maxGain > prev.maxGain) bySymbol.set(r.symbol, r);
  }
  const top = [...bySymbol.values()]
    .sort((a,b)=> b.maxGain - a.maxGain)
    .slice(0, 25);

  // --- Report ------------------------------------------------
  const pct = x => (x*100).toFixed(1) + '%';
  console.log('\n===== BACKTEST SUMMARY (Jun 1 – Jul 4) =====');
  console.log(`Tested signals: ${tested.length}`);
  console.log(`Explosive (score ≥85): ${explosive.length}`);
  console.log(`Hits (≥+20% within 5d & DD≥-10%): ${tested.filter(r=>r.hit).length} (${pct(hitRateAll)})`);
  console.log(`Hits among Explosive cohort: ${explosive.filter(r=>r.hit).length} (${pct(hitRateExplosive)})`);
  console.log(`Final PASS (Hit ∧ Explosive): ${passes.length}`);

  console.log('\nTop PASS tickers (best occurrence per symbol):');
  console.log('SYMBOL  | ExplScore | MaxGain | MaxDD  | DiscoveredAt');
  for (const r of top) {
    console.log(
      `${r.symbol.padEnd(7)}| ${String(r.explosiveness).padStart(9)} | ${pct(r.maxGain).padStart(7)} | ${pct(r.maxDD).padStart(6)} | ${new Date(r.created_at).toISOString().slice(0,10)}`
    );
  }

  // JSON export for UI/analysis
  const payload = {
    window: { start: START.toISOString().slice(0,10), end: END.toISOString().slice(0,10) },
    totals: {
      tested: tested.length,
      explosive: explosive.length,
      hits: tested.filter(r=>r.hit).length,
      passes: passes.length,
      hitRateAll,
      hitRateExplosive
    },
    passes: top.map(r => ({
      symbol: r.symbol,
      discoveredAt: r.created_at,
      explosiveness: r.explosiveness,
      entry: r.entry,
      maxGain: r.maxGain,
      maxDD: r.maxDD
    }))
  };

  console.log('\n— JSON summary —');
  console.log(JSON.stringify(payload, null, 2));
})();