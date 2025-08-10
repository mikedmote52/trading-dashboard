const fs = require('fs');
const https = require('https');
const { providerJsonPath } = require('./util');

function getYesterdayDateString() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
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

function parseFinraCsv(csvText) {
  if (!csvText) return {};
  
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return {};
  
  // Skip header line
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('|');
    if (parts.length >= 3) {
      const symbol = parts[1]?.trim();
      const shortVol = parseInt(parts[2]) || 0;
      const totalVol = parseInt(parts[3]) || 0;
      
      if (symbol && totalVol > 0) {
        if (!data[symbol]) {
          data[symbol] = { shortVol: 0, totalVol: 0 };
        }
        data[symbol].shortVol += shortVol;
        data[symbol].totalVol += totalVol;
      }
    }
  }
  
  return data;
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
  
  const cnmsParsed = parseFinraCsv(cnmsData);
  const nyseParsed = parseFinraCsv(nyseData);
  
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

module.exports = { fetchFinraShortVolume, getYesterdayDateString };