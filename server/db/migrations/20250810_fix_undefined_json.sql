-- Fix undefined JSON strings in discoveries table
-- These poison the JSON parsing and cause cascade failures

BEGIN TRANSACTION;

-- Fix features_json column
UPDATE discoveries 
SET features_json = '{}' 
WHERE features_json = 'undefined' OR features_json IS NULL;

-- Fix audit_json column  
UPDATE discoveries 
SET audit_json = '{}' 
WHERE audit_json = 'undefined' OR audit_json IS NULL;

-- Report what was fixed
SELECT 
    COUNT(*) as total_rows,
    SUM(CASE WHEN features_json = '{}' THEN 1 ELSE 0 END) as fixed_features,
    SUM(CASE WHEN audit_json = '{}' THEN 1 ELSE 0 END) as fixed_audit
FROM discoveries;

COMMIT;