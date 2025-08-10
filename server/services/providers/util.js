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

function writeJsonSafe(file, data) {
  // Skip file operations in production if filesystem is read-only
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_CACHE_WRITES === 'true') {
    console.warn('Skipping cache write in production (read-only filesystem)');
    return false;
  }
  
  const p = providerJsonPath(file);
  try {
    // Ensure directory exists
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    // In production, log but don't crash
    if (process.env.NODE_ENV === 'production') {
      console.warn('Cache write failed in production (expected on read-only filesystem)', { file: path.basename(p) });
    } else {
      console.warn('provider writeJsonSafe error', { file: p, msg: e.message });
    }
    return false;
  }
}

module.exports = { providerJsonPath, readJsonSafe, writeJsonSafe };