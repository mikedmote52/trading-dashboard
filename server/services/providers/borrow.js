const fetch = globalThis.fetch;

async function fetchWithTimeout(url, ms = 8000, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

const cheerio = require('cheerio');

const FIN_KEY = process.env.FINTEL_API_KEY || null;

async function fintelBorrow(ticker) {
  // API shape: https://fintel.io/api/{endpoint}  (paid)
  // Expect fields: fee, utilization, asof
  const url = `https://fintel.io/api/borrows/${ticker}?key=${FIN_KEY}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`fintel ${ticker} ${r.status}`);
  const j = await r.json();
  // j.history assumed sorted asc by date
  const hist = (j.history || []).slice(-10);
  if (hist.length < 2) return null;
  const last = hist[hist.length - 1];
  const sevenAgo = hist[Math.max(0, hist.length - 8)];
  const trend = (last.fee_pct ?? 0) - (sevenAgo.fee_pct ?? 0);
  const ageDays = j.short_interest_asof_days ?? null;
  return {
    borrow_fee_pct: last.fee_pct ?? null,
    borrow_fee_trend_pp7d: trend ?? null,
    utilization_pct: last.utilization_pct ?? null,
    freshness: { short_interest_age_days: ageDays }
  };
}

async function iborrowdeskBorrow(ticker) {
  // HTML daily table for fee; limited fidelity, no utilization
  // We compute a 7d delta from the last 10 rows
  const url = `https://iborrowdesk.com/report/${ticker}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`iborrowdesk ${ticker} ${r.status}`);
  const html = await r.text();
  const $ = cheerio.load(html);
  const rows = [];
  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    const date = $(tds[0]).text().trim();
    const feeStr = $(tds[2]).text().trim().replace('%','');
    const fee = parseFloat(feeStr);
    if (!isNaN(fee)) rows.push({ date, fee });
  });
  rows.sort((a,b) => new Date(a.date) - new Date(b.date));
  const hist = rows.slice(-10);
  if (hist.length < 2) return null;
  const last = hist[hist.length - 1];
  const sevenAgo = hist[Math.max(0, hist.length - 8)];
  const trend = last.fee - sevenAgo.fee;
  return {
    borrow_fee_pct: last.fee,
    borrow_fee_trend_pp7d: trend,
    utilization_pct: null,
    freshness: { short_interest_age_days: null }
  };
}

async function getBorrowFor(ticker) {
  if (FIN_KEY) {
    try { const x = await fintelBorrow(ticker); if (x) return x; } catch {}
  }
  try { return await iborrowdeskBorrow(ticker); } catch {}
  return null; // engine will drop with explicit gate reason
}

module.exports = { getBorrowFor };