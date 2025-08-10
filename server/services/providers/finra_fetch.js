const fs = require('fs');
const https = require('https');
const { providerJsonPath, readJsonSafe, writeJsonSafe } = require('./util');

// Date utilities
function ymd(d){ return d.toISOString().slice(0,10).replace(/-/g,''); }
function prevMarketDay(d){
  const x = new Date(d);
  do { x.setDate(x.getDate() - 1); } while (x.getDay()===0 || x.getDay()===6);
  return x;
}

function getYesterdayDateString() {
  return ymd(prevMarketDay(new Date()));
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

function parseFinraText(txt) {
  if (!txt) return {};
  const out = {};
  const lines = txt.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {         // skip header
    const cols = lines[i].split('|');
    if (cols.length < 6) continue;
    const sym = String(cols[1] || '').toUpperCase().trim();
    const shortVol = Number((cols[2] || '0').replace(/,/g, ''));
    const totalVol = Number((cols[4] || '0').replace(/,/g, ''));
    if (!sym || !Number.isFinite(shortVol) || !Number.isFinite(totalVol)) continue;
    // aggregate per symbol (sum across tapes)
    const acc = out[sym] || (out[sym] = { shortVol: 0, totalVol: 0 });
    acc.shortVol += shortVol;
    acc.totalVol += totalVol;
  }
  return out;
}

async function fetchFinraShortVolume() {
  const dateStr = getYesterdayDateString();
  const asof = new Date().toISOString().split('T')[0];
  
  console.log(`Fetching FINRA short volume for ${dateStr}`);
  
  const cnmsUrl = `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${dateStr}.txt`;
  const nyseUrl = `https://cdn.finra.org/equity/regsho/daily/NYSEshvol${dateStr}.txt`;
  
  const [cnmsData, nyseData] = await Promise.all([
    fetchUrl(cnmsUrl),
    fetchUrl(nyseUrl)
  ]);
  
  if (!cnmsData && !nyseData) {
    console.warn('Failed to fetch FINRA data for', dateStr);
    return null;
  }
  
  const cnmsParsed = parseFinraText(cnmsData);
  const nyseParsed = parseFinraText(nyseData);
  
  // Aggregate data from both exchanges
  const aggregated = {};
  
  // Process CNMS data
  Object.entries(cnmsParsed).forEach(([symbol, data]) => {
    if (!aggregated[symbol]) {
      aggregated[symbol] = { shortVol: 0, totalVol: 0, dates: [] };
    }
    aggregated[symbol].shortVol += data.shortVol;
    aggregated[symbol].totalVol += data.totalVol;
    aggregated[symbol].dates.push(dateStr);
  });
  
  // Process NYSE data
  Object.entries(nyseParsed).forEach(([symbol, data]) => {
    if (!aggregated[symbol]) {
      aggregated[symbol] = { shortVol: 0, totalVol: 0, dates: [] };
    }
    aggregated[symbol].shortVol += data.shortVol;
    aggregated[symbol].totalVol += data.totalVol;
    if (!aggregated[symbol].dates.includes(dateStr)) {
      aggregated[symbol].dates.push(dateStr);
    }
  });
  
  // Calculate rolling averages (simplified - just use current day for now)
  const result = {};
  Object.entries(aggregated).forEach(([symbol, data]) => {
    result[symbol] = {
      sv_5d: data.shortVol,   // For now, use single day
      sv_20d: data.shortVol,  // For now, use single day  
      svr_5d: data.totalVol > 0 ? data.shortVol / data.totalVol : 0,
      svr_20d: data.totalVol > 0 ? data.shortVol / data.totalVol : 0,
      asof
    };
  });
  
  // Save to cache file
  try {
    const outputPath = providerJsonPath('finra_shortvol.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Saved FINRA data for ${Object.keys(result).length} symbols to ${outputPath}`);
  } catch (e) {
    console.warn('Failed to save FINRA data:', e.message);
  }
  
  return result;
}

async function fetchLatestShortvol(maxBack=5){
  let d = prevMarketDay(new Date());
  for (let i=0; i<maxBack; i++){
    const tag = ymd(d);
    
    // Try cache first
    const cached = readJsonSafe(`finra_shortvol_${tag}.json`);
    if (cached) return { date: tag, data: cached };
    
    // Try fetch
    console.log(`Trying FINRA data for ${tag}`);
    const cnmsUrl = `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${tag}.txt`;
    const nyseUrl = `https://cdn.finra.org/equity/regsho/daily/NYSEshvol${tag}.txt`;
    
    const [cnmsData, nyseData] = await Promise.all([
      fetchUrl(cnmsUrl),
      fetchUrl(nyseUrl)
    ]);
    
    if (cnmsData || nyseData) {
      const cnmsParsed = parseFinraText(cnmsData);
      const nyseParsed = parseFinraText(nyseData);
      
      // Aggregate data from both exchanges
      const aggregated = {};
      
      // Process CNMS data
      Object.entries(cnmsParsed).forEach(([symbol, data]) => {
        const k = symbol.toUpperCase(); // ensure uppercase keys
        if (!aggregated[k]) {
          aggregated[k] = { shortVol: 0, totalVol: 0, dates: [] };
        }
        aggregated[k].shortVol += data.shortVol;
        aggregated[k].totalVol += data.totalVol;
        aggregated[k].dates.push(tag);
      });
      
      // Process NYSE data
      Object.entries(nyseParsed).forEach(([symbol, data]) => {
        const k = symbol.toUpperCase(); // ensure uppercase keys
        if (!aggregated[k]) {
          aggregated[k] = { shortVol: 0, totalVol: 0, dates: [] };
        }
        aggregated[k].shortVol += data.shortVol;
        aggregated[k].totalVol += data.totalVol;
        if (!aggregated[k].dates.includes(tag)) {
          aggregated[k].dates.push(tag);
        }
      });
      
      // Format result with proper ratio calculation
      const result = {};
      Object.entries(aggregated).forEach(([k, d]) => {
        const ratio = d.totalVol > 0 ? d.shortVol / d.totalVol : 0;
        // guard against edge cases
        const svr = Math.max(0, Math.min(1, ratio));
        result[k] = {
          sv_5d: d.shortVol,            // still single-day until you roll windows
          sv_20d: d.shortVol,
          svr_5d: svr,
          svr_20d: svr,
          asof: new Date().toISOString().split('T')[0] // use current date
        };
      });
      
      // Cache the result
      writeJsonSafe(`finra_shortvol_${tag}.json`, result);
      console.log(`Cached FINRA data for ${tag} with ${Object.keys(result).length} symbols`);
      return { date: tag, data: result };
    }
    
    d = prevMarketDay(d);
  }
  return { date: null, data: null };
}

module.exports = { fetchFinraShortVolume, fetchLatestShortvol, getYesterdayDateString };