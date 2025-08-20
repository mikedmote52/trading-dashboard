-- Create discoveries_vigl as a VIEW for compatibility
-- This resolves "no such table: discoveries_vigl" errors
CREATE VIEW IF NOT EXISTS discoveries_vigl AS
SELECT 
  id,
  symbol,
  score,
  rvol,
  price,
  'VIEW-COMPAT' as reason,
  created_at,
  updated_at
FROM discoveries
WHERE score IS NOT NULL;

-- Add missing columns that might be expected
-- (SQLite VIEW can't have computed columns, but this ensures compatibility)