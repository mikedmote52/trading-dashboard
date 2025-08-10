const https = require('https');

function polygonRequest(endpoint) {
  return new Promise(resolve => {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) return resolve(null);
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `https://api.polygon.io${endpoint}${sep}apiKey=${apiKey}`;
    https.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode !== 200 || json?.status === 'ERROR') return resolve(null);
          resolve(json);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

module.exports = { polygonRequest };