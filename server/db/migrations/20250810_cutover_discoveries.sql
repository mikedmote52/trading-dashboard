BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS discoveries_legacy_archive AS
  SELECT * FROM discoveries;

DROP TABLE IF EXISTS discoveries;

CREATE TABLE discoveries (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  score REAL NOT NULL,
  preset TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  features_json TEXT NOT NULL,
  audit_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discoveries_created ON discoveries(created_at);
CREATE INDEX IF NOT EXISTS idx_discoveries_symbol ON discoveries(symbol);

COMMIT;