-- Migration: OPS-017, OPS-021 — Add hubspot and ops_table source types
-- Date: 2026-02-05

-- Drop and recreate source_type CHECK to add hubspot and ops_table
ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN ('manual', 'apollo', 'csv', 'copilot', 'hubspot', 'ops_table'));

NOTIFY pgrst, 'reload schema';
