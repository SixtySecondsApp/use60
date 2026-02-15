-- Migration: SOT-001 — Standard Ops Tables Schema
-- Purpose: Add support for standard (template-based) ops tables with system columns,
--          locked fields, multi-source sync, and RLS protection against deletion.
-- Date: 2026-02-18

-- =============================================================================
-- Step 1: Add is_standard flag to dynamic_tables
-- =============================================================================

ALTER TABLE public.dynamic_tables
  ADD COLUMN IF NOT EXISTS is_standard BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dynamic_tables.is_standard IS
  'True if this table was provisioned from a standard template. Standard tables cannot be deleted by users.';

-- =============================================================================
-- Step 2: Update source_type CHECK constraint on dynamic_tables
-- =============================================================================

-- Include: 'standard' (template-provisioned tables) and 'ops_table' (user-created ops tables)
-- Existing: 'manual', 'apollo', 'csv', 'copilot', 'hubspot', 'attio'

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN (
    'manual', 'apollo', 'csv', 'copilot',
    'hubspot', 'attio', 'ops_table', 'standard'
  ));

COMMENT ON CONSTRAINT dynamic_tables_source_type_check ON public.dynamic_tables IS
  'standard = provisioned from template, ops_table = user-created ops table';

-- =============================================================================
-- Step 3: Add system/locked columns to dynamic_table_columns
-- =============================================================================

-- is_system: Core columns that should never be deleted (e.g., Name, Status)
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dynamic_table_columns.is_system IS
  'True for core columns in standard tables that should never be deleted (e.g., Name, Status, Owner).';

-- is_locked: Columns that can't be edited (name/type/config)
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dynamic_table_columns.is_locked IS
  'True for columns whose name, type, or config should not be editable by users.';

-- =============================================================================
-- Step 4: Add integration mapping columns to dynamic_table_columns
-- =============================================================================

-- HubSpot property mapping (may already exist from HS-004 migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dynamic_table_columns'
      AND column_name = 'hubspot_property_name'
  ) THEN
    ALTER TABLE public.dynamic_table_columns
      ADD COLUMN hubspot_property_name TEXT DEFAULT NULL;

    COMMENT ON COLUMN public.dynamic_table_columns.hubspot_property_name IS
      'HubSpot property internal name for hubspot_property column type (e.g. firstname, jobtitle)';
  END IF;
END $$;

-- Attio property mapping (added in ATTIO-001, included here for completeness)
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS attio_property_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.attio_property_name IS
  'Attio attribute slug for attio_property column type (e.g. name, email_addresses, domains)';

-- App source mapping (e.g., contacts.first_name, deals.stage)
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS app_source_table TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.app_source_table IS
  'Source table in the app schema for hybrid sync (e.g., contacts, deals, tasks). Used with app_source_column.';

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS app_source_column TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.app_source_column IS
  'Source column in the app table (e.g., first_name, stage, owner_id). Paired with app_source_table.';

-- =============================================================================
-- Step 5: Add source_type to dynamic_table_rows (multi-source tracking)
-- =============================================================================

ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual'
  CHECK (source_type IN ('manual', 'hubspot', 'attio', 'app'));

COMMENT ON COLUMN public.dynamic_table_rows.source_type IS
  'Source of truth for this row: manual (user-created), hubspot (synced from HubSpot), attio (synced from Attio), app (backfilled from app tables like contacts/deals).';

-- =============================================================================
-- Step 6: Add ops_tables_provisioned to organizations
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ops_tables_provisioned BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.ops_tables_provisioned IS
  'True if standard ops tables have been auto-provisioned for this org. Prevents duplicate provisioning.';

-- =============================================================================
-- Step 7: Add RLS policies to protect system columns and standard tables
-- =============================================================================

-- RESTRICTIVE policy: Block deletion of system columns
-- (works alongside existing permissive "Users can manage columns of own tables" policy)
CREATE POLICY "Block deletion of system columns"
  ON public.dynamic_table_columns
  AS RESTRICTIVE
  FOR DELETE
  USING (is_system = false);

COMMENT ON POLICY "Block deletion of system columns" ON public.dynamic_table_columns IS
  'Restrictive policy that prevents deletion of system columns (is_system = true) even if user owns the table.';

-- RESTRICTIVE policy: Block deletion of standard tables
-- (works alongside existing permissive "Users can delete own dynamic tables" policy)
CREATE POLICY "Block deletion of standard tables"
  ON public.dynamic_tables
  AS RESTRICTIVE
  FOR DELETE
  USING (is_standard = false);

COMMENT ON POLICY "Block deletion of standard tables" ON public.dynamic_tables IS
  'Restrictive policy that prevents deletion of standard template tables (is_standard = true) even if user created them.';

-- =============================================================================
-- Step 8: Add indexes for performance
-- =============================================================================

-- Index for finding standard tables by org
CREATE INDEX IF NOT EXISTS idx_dynamic_tables_is_standard
  ON public.dynamic_tables(organization_id)
  WHERE is_standard = true;

COMMENT ON INDEX idx_dynamic_tables_is_standard IS
  'Efficiently find all standard tables for an organization (used during auto-provisioning checks).';

-- Index for finding system columns
CREATE INDEX IF NOT EXISTS idx_dynamic_table_columns_is_system
  ON public.dynamic_table_columns(table_id)
  WHERE is_system = true;

COMMENT ON INDEX idx_dynamic_table_columns_is_system IS
  'Efficiently find system columns within a table.';

-- Index for app source mapping lookups
CREATE INDEX IF NOT EXISTS idx_dynamic_table_columns_app_source
  ON public.dynamic_table_columns(app_source_table, app_source_column)
  WHERE app_source_table IS NOT NULL;

COMMENT ON INDEX idx_dynamic_table_columns_app_source IS
  'Efficiently find columns that sync from specific app tables (e.g., find all columns pulling from contacts.first_name).';

-- Index for row source type filtering
CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_source_type
  ON public.dynamic_table_rows(table_id, source_type);

COMMENT ON INDEX idx_dynamic_table_rows_source_type IS
  'Efficiently filter rows by source (e.g., show only app-synced rows, or only manual rows).';

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
