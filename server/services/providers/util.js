const path = require('path');
const fs = require('fs');

function providerJsonPath(file) {
  // repo root = two levels up from server/
  // server/services/providers -> server -> repo root
  const root = path.resolve(__dirname, '..', '..', '..');
  return path.join(root, 'data', 'providers', file);
}

function readJsonSafe(file) {
  const p = providerJsonPath(file);
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('provider readJsonSafe error', { file: p, msg: e.message });
    return null;
  }
}

module.exports = { providerJsonPath, readJsonSafe };