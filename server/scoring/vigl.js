const { dailyBars } = require('../providers/polygonAggs');
const { recentNewsCount } = require('../providers/polygonNews');
const { ema, rsi, atr } = require('../lib/ta');

/**
 * scoreStock(symbol): returns { symbol, components, composite, reasons }
 * Components: volume(0-100), squeeze(0-100), catalyst(0-100), sentiment(0-100), options(0-100), technical(0-100)
 * We re-weight to available components so good names can pass thresholds WITHOUT lowering thresholds.
 */
async function scoreStock(symbol){
  const reasons = [];
  // --- data fetch ---
  let bars = [];
  try { bars = await dailyBars(symbol, 60); } catch(e){ reasons.push(`no_bars:${e.message}`); }
  if (bars.length < 25){ return { symbol, components:zero(), composite:0, reasons:[...reasons,'insufficient_bars'] }; }
  const closes = bars.map(b=>b.c), highs=bars.map(b=>b.h), lows=bars.map(b=>b.l), vols=bars.map(b=>b.v);
  const last = bars[bars.length-1];

  // --- volume ---
  const avg30 = avg(vols.slice(-31,-1));
  const rvol = avg30 ? last.v/avg30 : 0;
  const volScore = Math.max(0, Math.min(100, (rvol-1)*100/2)); // 1x->0, 3x->100
  if (rvol<1) reasons.push('rvol<1');

  // --- technicals ---
  const ema9 = ema(closes,9), ema20 = ema(closes,20);
  const rsi14 = rsi(closes,14).at(-1);
  const atr14 = atr(highs,lows,closes,14).at(-1);
  const atrPct = atr14 && last.c ? (atr14/last.c*100) : 0;
  const emaBull = ema9.at(-1) > ema20.at(-1);
  let techScore = 0;
  techScore += clamp((rsi14-50)*5, 0, 40);          // RSI 50→0, 70→100 (capped 40 here)
  techScore += clamp((atrPct-2)*10, 0, 30);         // ATR% 2→0, 5→30
  techScore += emaBull ? 30 : 0;                    // EMA9>EMA20 bonus
  techScore = Math.min(100, techScore);

  // --- squeeze proxy (no borrow provider) ---
  // Proxy = high RVOL + elevated ATR% + price near recent high
  const high20 = Math.max(...highs.slice(-20));
  const nearHigh = last.c / high20;
  const squeezeScore = clamp(((rvol-1)*40) + ((atrPct-2)*10) + ((nearHigh-0.95)*200), 0, 100);

  // --- catalysts via Polygon news ---
  let catalystScore = 0, sentimentScore=0;
  try {
    const nw = await recentNewsCount(symbol, 3);
    catalystScore = clamp(nw.count*8 + nw.pos*4 - nw.neg*6, 0, 100); // 5+ fresh items pushes high
    sentimentScore = clamp((nw.pos - nw.neg)*20 + nw.count*2, 0, 100);
  } catch(e){
    reasons.push('news_fail');
  }

  // --- options (not wired yet) ---
  const optionsScore = 0; // until wired to a provider

  // --- weights with reweighting ---
  const weights = {
    volume: 0.25,
    squeeze: 0.20,
    catalyst: 0.20,
    sentiment: 0.15,
    options: 0.10,
    technical: 0.10
  };
  const available = {
    volume: isFinite(volScore),
    squeeze: true,
    catalyst: catalystScore>0 || true, // news can be zero; still available
    sentiment: true, // computed from news for now
    options: optionsScore>0 ? true : false,
    technical: isFinite(techScore)
  };
  const sum = Object.entries(weights)
    .filter(([k])=>available[k])
    .reduce((s,[,w])=>s+w,0);
  const scale = sum>0 ? (1/sum) : 1;

  const components = {
    volume: round(volScore),
    squeeze: round(squeezeScore),
    catalyst: round(catalystScore),
    sentiment: round(sentimentScore),
    options: round(optionsScore),
    technical: round(techScore),
  };

  const composite =
    round( (components.volume   * weights.volume   +
            components.squeeze  * weights.squeeze  +
            components.catalyst * weights.catalyst +
            components.sentiment* weights.sentiment+
            components.options  * weights.options  +
            components.technical* weights.technical) * scale );

  return { symbol, components, composite, reasons };
}

function avg(a){ return a.length? a.reduce((s,x)=>s+x,0)/a.length : 0; }
function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }
function round(x){ return Math.round(x*10)/10; }
function zero(){ return {volume:0,squeeze:0,catalyst:0,sentiment:0,options:0,technical:0}; }
module.exports = { scoreStock };