const fetch = globalThis.fetch;
const cheerio = require('cheerio');

const POLY_KEY = process.env.POLYGON_API_KEY || null;

function inWindow(dateStr, min=14, max=30) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.round((d - now) / (1000*60*60*24));
  return { ok: diff >= min && diff <= max, days: diff };
}

async function polygonEarnings(ticker) {
  if (!POLY_KEY) return null;
  const url = `https://api.polygon.io/vX/reference/earnings?ticker=${ticker}&limit=5&apiKey=${POLY_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const upcoming = (j.results || []).find(x => x.period === 'upcoming' || new Date(x.reportDate) > new Date());
  if (!upcoming) return null;
  const { ok, days } = inWindow(upcoming.reportDate);
  return {
    type: 'earnings',
    date: upcoming.reportDate,
    source: 'polygon',
    date_valid: ok,
    days_to_event: days,
    cred: 0.9
  };
}

async function secUpcomingFiling(ticker) {
  // crude heuristic: next 10-Q deadline = last 10-K or 10-Q + 45 days; only used if polygon not present
  // better: scrape issuer IR for earnings date, below
  return null;
}

async function irScrapeEarnings(ticker) {
  // try common IR URL patterns, return first date found in ISO format
  const bases = [
    `https://ir.${ticker.toLowerCase()}.com/`,
    `https://investor.${ticker.toLowerCase()}.com/`,
  ];
  for (const base of bases) {
    try {
      const r = await fetch(base, { timeout: 5000 });
      if (!r.ok) continue;
      const html = await r.text();
      const $ = cheerio.load(html);
      const text = $('body').text();
      const m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
      if (m) {
        const iso = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        const { ok, days } = inWindow(iso);
        return { type: 'earnings', date: iso, source: base, date_valid: ok, days_to_event: days, cred: 0.7 };
      }
    } catch {}
  }
  return null;
}

async function getCatalystFor(ticker) {
  const fromPoly = await polygonEarnings(ticker);
  if (fromPoly) return fromPoly;
  const fromIR = await irScrapeEarnings(ticker);
  if (fromIR) return fromIR;
  return null;
}

module.exports = { getCatalystFor };