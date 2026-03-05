-- Migration: HS-004 — Add hubspot_property column type
-- Allows users to add columns that pull values from HubSpot properties
-- Date: 2026-02-05

-- =============================================================================
-- Step 1: Drop existing CHECK constraint and recreate with hubspot_property
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

DO $$ BEGIN
  ALTER TABLE public.dynamic_table_columns
  ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type IN (
    'text', 'email', 'url', 'number', 'boolean', 'enrichment',
    'status', 'person', 'company', 'linkedin', 'date',
    'dropdown', 'tags', 'phone', 'checkbox', 'formula',
    'integration', 'action', 'hubspot_property'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 2: Add hubspot_property_name column
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS hubspot_property_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.hubspot_property_name IS
  'HubSpot property internal name for hubspot_property column type (e.g. firstname, jobtitle)';

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
