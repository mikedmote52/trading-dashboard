const fetch = require('node-fetch');
const API = 'https://api.polygon.io';
const KEY = process.env.POLYGON_API_KEY;
async function dailyBars(symbol, days=60){
  const to = new Date().toISOString().slice(0,10);
  const from = new Date(Date.now()-days*864e5).toISOString().slice(0,10);
  const url = `${API}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${KEY}`;
  const res = await fetch(url); if(!res.ok) throw new Error(`polygon aggs ${symbol}: ${res.status}`);
  const j = await res.json(); return (j.results||[]).map(r=>({t:r.t,o:r.o,h:r.h,l:r.l,c:r.c,v:r.v}));
}
module.exports = { dailyBars };