-- Migration: APO-001 — Add apollo_property column type
-- Allows users to add columns that pull enriched values from Apollo
-- Also adds 'button' to legitimize existing frontend usage
-- Date: 2026-02-06

-- =============================================================================
-- Step 1: Drop existing CHECK constraint and recreate with apollo_property + button
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

ALTER TABLE public.dynamic_table_columns
  ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type IN (
    'text', 'email', 'url', 'number', 'boolean', 'enrichment',
    'status', 'person', 'company', 'linkedin', 'date',
    'dropdown', 'tags', 'phone', 'checkbox', 'formula',
    'integration', 'action', 'button',
    'hubspot_property', 'apollo_property'
  ));

-- =============================================================================
-- Step 2: Add apollo_property_name column
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS apollo_property_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.apollo_property_name IS
  'Apollo enrichment field name for apollo_property column type (e.g. email, phone, organization.industry)';

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
