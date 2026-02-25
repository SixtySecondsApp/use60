-- Migration: ICP-004 — Add linked_table_id and source tagging for ICP profiles
-- Purpose: Link ICP profiles to their ops tables and enable source tracking in dynamic_table_rows
-- Date: 2026-02-15

-- =============================================================================
-- Step 1: Add linked_table_id to icp_profiles
-- =============================================================================

-- Add nullable FK to dynamic_tables (set when ops table is auto-created)
ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS linked_table_id UUID DEFAULT NULL
  REFERENCES public.dynamic_tables(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.icp_profiles.linked_table_id IS
  'FK to the auto-created ops table for this ICP profile. NULL if no linked table exists.';

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_icp_profiles_linked_table_id
  ON public.icp_profiles(linked_table_id);

-- =============================================================================
-- Step 2: Add 'icp' to dynamic_tables source_type CHECK constraint
-- =============================================================================

-- Current values: 'manual', 'apollo', 'csv', 'copilot', 'hubspot', 'attio', 'ops_table', 'standard'
-- Add: 'icp' (for tables auto-created from ICP profile searches)

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

DO $$ BEGIN
  ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN (
    'manual', 'apollo', 'csv', 'copilot',
    'hubspot', 'attio', 'ops_table', 'standard', 'icp'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON CONSTRAINT dynamic_tables_source_type_check ON public.dynamic_tables IS
  'standard = provisioned from template, ops_table = user-created ops table, icp = auto-created from ICP profile';

-- Update source_type column comment to include 'icp'
COMMENT ON COLUMN public.dynamic_tables.source_type IS
  'How the table was created: manual, apollo search, csv import, copilot conversation, hubspot sync, attio sync, ops_table, standard template, or icp profile.';

-- =============================================================================
-- Step 3: Add source_icp_id to dynamic_table_rows
-- =============================================================================

-- Add nullable FK to icp_profiles (set when row comes from ICP search)
ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS source_icp_id UUID DEFAULT NULL
  REFERENCES public.icp_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dynamic_table_rows.source_icp_id IS
  'FK to the ICP profile that sourced this row (for ICP search results). NULL for rows from other sources.';

-- Add index for efficient filtering by ICP source
CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_source_icp_id
  ON public.dynamic_table_rows(source_icp_id);

-- Add composite index for table + ICP source (for deduplication/filtering)
CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_table_icp
  ON public.dynamic_table_rows(table_id, source_icp_id)
  WHERE source_icp_id IS NOT NULL;

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
