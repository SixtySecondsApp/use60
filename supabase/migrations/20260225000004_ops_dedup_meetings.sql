-- 1. Remove duplicate rows (keep newest per source_id per table)
DELETE FROM dynamic_table_rows a
USING dynamic_table_rows b
WHERE a.table_id = b.table_id
  AND a.source_id = b.source_id
  AND a.source_type = 'app'
  AND b.source_type = 'app'
  AND a.source_id IS NOT NULL
  AND a.created_at < b.created_at;

-- 2. Add unique partial index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_dynamic_table_rows_unique_source
  ON dynamic_table_rows(table_id, source_id)
  WHERE source_id IS NOT NULL AND source_type = 'app';
