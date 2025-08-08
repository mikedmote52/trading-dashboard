const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

// Create database in project root
const dbPath = path.join(__dirname, '../../trading_dashboard.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
CREATE TABLE IF NOT EXISTS discovery_runs (
  run_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  scanner_version TEXT NOT NULL,
  input_signature TEXT NOT NULL,
  source_window TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS discoveries (
  run_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  confidence REAL,
  momentum REAL,
  volume_spike REAL,
  risk TEXT,
  features TEXT,
  PRIMARY KEY (run_id, rank),
  FOREIGN KEY (run_id) REFERENCES discovery_runs(run_id)
);
`);

// Prepared statements
const insertRun = db.prepare(`
  INSERT INTO discovery_runs (run_id, created_at, scanner_version, input_signature, source_window, note)
  VALUES (@run_id, @created_at, @scanner_version, @input_signature, @source_window, @note)
`);

const insertDiscovery = db.prepare(`
  INSERT INTO discoveries (run_id, rank, symbol, name, confidence, momentum, volume_spike, risk, features)
  VALUES (@run_id, @rank, @symbol, @name, @confidence, @momentum, @volume_spike, @risk, @features)
`);

const getLatestRun = db.prepare(`
  SELECT * FROM discovery_runs
  ORDER BY created_at DESC
  LIMIT 1
`);

const getRunById = db.prepare(`
  SELECT * FROM discovery_runs
  WHERE run_id = ?
`);

const getDiscoveriesByRun = db.prepare(`
  SELECT * FROM discoveries
  WHERE run_id = ?
  ORDER BY rank ASC
`);

/**
 * Persist a discovery bundle to the database
 * @param {Object} bundle - Discovery bundle with run metadata and items
 */
function persistDiscoveryBundle(bundle) {
  const transaction = db.transaction((bundle) => {
    // Insert run metadata
    insertRun.run({
      run_id: bundle.run_id,
      created_at: bundle.created_at,
      scanner_version: bundle.scanner_version,
      input_signature: bundle.input_signature,
      source_window: bundle.source_window,
      note: bundle.note || null
    });

    // Sort discoveries deterministically
    const sortedItems = [...bundle.items].sort((a, b) => {
      // Primary: score descending
      if (a.score !== b.score) return b.score - a.score;
      // Secondary: symbol ascending
      if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
      // Tertiary: volume_spike descending
      return b.volume_spike - a.volume_spike;
    });

    // Insert each discovery with rank
    sortedItems.forEach((item, index) => {
      insertDiscovery.run({
        run_id: bundle.run_id,
        rank: index + 1,
        symbol: item.symbol,
        name: item.name || null,
        confidence: item.confidence || item.score || 0,
        momentum: item.momentum || 0,
        volume_spike: item.volume_spike || 0,
        risk: item.risk || 'Unknown',
        features: JSON.stringify(item.features || item)
      });
    });
  });

  transaction(bundle);
}

/**
 * Get the latest discovery bundle
 */
function getLatestBundle() {
  const run = getLatestRun.get();
  if (!run) return null;

  const items = getDiscoveriesByRun.all(run.run_id);
  return { run, items };
}

/**
 * Get a specific discovery bundle by run_id
 */
function getBundleById(runId) {
  const run = getRunById.get(runId);
  if (!run) return null;

  const items = getDiscoveriesByRun.all(runId);
  return { run, items };
}

/**
 * Generate input signature for discovery params
 */
function generateInputSignature(params) {
  const canonicalParams = {
    universe: params.universe || 'all',
    lookback_minutes: params.lookback_minutes || 30,
    resolution: params.resolution || '1min',
    timezone: 'America/New_York',
    polygon_key_tail: params.polygon_key_tail || 'none',
    vigl_version: params.vigl_version || process.env.VIGL_VERSION || '0.1.0'
  };
  
  const canonicalJSON = JSON.stringify(canonicalParams, Object.keys(canonicalParams).sort());
  return crypto.createHash('sha256').update(canonicalJSON).digest('hex');
}

module.exports = {
  db,
  persistDiscoveryBundle,
  getLatestBundle,
  getBundleById,
  generateInputSignature
};