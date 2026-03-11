-- Migration: add_ad_library_source_type
-- Date: 20260311165923
--
-- What this migration does:
--   Adds 'ad_library' to the dynamic_tables.source_type CHECK constraint so that
--   ops tables created from the LinkedIn Ad Library import wizard are accepted.
--
-- Rollback strategy:
--   N/A — additive only. Existing rows are unaffected; removing this value would
--   only require dropping and recreating the constraint without 'ad_library'.

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN (
    'manual', 'apollo', 'csv', 'copilot',
    'hubspot', 'attio', 'ops_table', 'standard',
    'ai_ark', 'explorium', 'ad_library'
  ));

NOTIFY pgrst, 'reload schema';

