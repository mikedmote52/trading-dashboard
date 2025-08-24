const fetch = require('node-fetch');
const API = 'https://api.polygon.io';
const KEY = process.env.POLYGON_API_KEY;
async function recentNewsCount(symbol, lookbackDays=3){
  const published_utc = `gte=${new Date(Date.now()-lookbackDays*864e5).toISOString()}`;
  const url = `${API}/v2/reference/news?ticker=${encodeURIComponent(symbol)}&order=desc&limit=50&${published_utc}&apiKey=${KEY}`;
  const res = await fetch(url); if(!res.ok) return { count:0, pos:0, neg:0 };
  const j = await res.json();
  const items = j.results||[];
  // crude sentiment: titles with "beat, raises, upgrade" vs "miss, downgrade, probe"
  const posWords = /beat|raises|upgrade|acquire|approv|record|strong|surge/i;
  const negWords = /miss|downgrade|probe|recall|lawsuit|guidance cut|cuts guidance|delay/i;
  let pos=0,neg=0;
  for(const n of items){
    const t=(n.title||'')+' '+(n.description||'');
    if(posWords.test(t)) pos++; else if(negWords.test(t)) neg++;
  }
  return { count: items.length, pos, neg };
}
module.exports = { recentNewsCount };