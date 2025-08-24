#!/usr/bin/env node
function ema(values, period) {
  const k = 2 / (period + 1);
  let emaVal = values[0];
  const out = [emaVal];
  for (let i = 1; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
    out.push(emaVal);
  }
  return out;
}
function rsi(closes, period=14) {
  let gains=0, losses=0;
  for (let i=1;i<=period;i++){
    const d = closes[i]-closes[i-1];
    if (d>=0) gains+=d; else losses+=-d;
  }
  let rs = losses===0? 100 : gains/losses;
  const out = Array(period).fill(NaN);
  out.push(100 - (100/(1+rs)));
  for (let i=period+1;i<closes.length;i++){
    const d = closes[i]-closes[i-1];
    const gain = Math.max(0,d), loss=Math.max(0,-d);
    gains = (gains*(period-1)+gain)/period;
    losses = (losses*(period-1)+loss)/period;
    rs = losses===0? 100 : gains/losses;
    out.push(100 - (100/(1+rs)));
  }
  return out;
}
function atr(highs,lows,closes,period=14){
  const trs=[];
  for(let i=0;i<highs.length;i++){
    if(i===0){ trs.push(highs[i]-lows[i]); continue; }
    const h=highs[i], l=lows[i], pc=closes[i-1];
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  const out=[];
  let s=0;
  for(let i=0;i<trs.length;i++){
    s+=trs[i];
    if(i<period-1){ out.push(NaN); }
    else if(i===period-1){ out.push(s/period); }
    else { const prev = out[out.length-1]; out.push((prev*(period-1)+trs[i])/period); }
  }
  return out;
}
module.exports = { ema, rsi, atr };