const fs = require('fs');
const yaml = require('js-yaml');

function loadConfig(path) {
  const p = path || process.env.SQUEEZE_CONFIG_PATH || 'server/config/squeeze.yml';
  const raw = fs.readFileSync(p, 'utf8');
  return yaml.load(raw);
}

module.exports = { loadConfig };