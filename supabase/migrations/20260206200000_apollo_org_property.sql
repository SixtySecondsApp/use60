-- Migration: APO-011 — Add apollo_org_property column type
-- Allows users to add columns that pull company-level enriched values from Apollo
-- Date: 2026-02-06

-- =============================================================================
-- Step 1: Drop and recreate CHECK constraint with apollo_org_property
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
    'integration', 'action', 'button',
    'hubspot_property', 'apollo_property', 'apollo_org_property'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
