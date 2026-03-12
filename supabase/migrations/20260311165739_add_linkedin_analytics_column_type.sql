-- Migration: add_linkedin_analytics_column_type
-- Date: 20260311165739
--
-- What this migration does:
--   Adds 'linkedin_analytics', 'agent_research', 'ai_image', 'fal_video', 'svg_animation'
--   to the dynamic_table_columns.column_type CHECK constraint.
--   Also adds 'agent_research' which exists in the frontend AddColumnModal but was missing from the DB constraint.
--
-- Rollback strategy:
--   N/A — additive only (new column type values; no existing data is affected)

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
    'linkedin_property',
    'instantly', 'signal',
    'linkedin_analytics', 'agent_research', 'ai_image', 'fal_video', 'svg_animation'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
