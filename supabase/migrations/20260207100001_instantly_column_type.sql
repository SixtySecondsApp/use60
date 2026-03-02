-- Migration: INSCOL — Add 'instantly' column type for Instantly campaign integration
-- Date: 2026-02-07

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
    'hubspot_property', 'apollo_property', 'apollo_org_property',
    'instantly'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
