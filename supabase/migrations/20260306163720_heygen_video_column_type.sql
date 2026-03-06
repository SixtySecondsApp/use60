-- Migration: heygen_video_column_type
-- Date: 20260306163720
--
-- What this migration does:
--   Adds heygen_video and other missing column types to the dynamic_table_columns check constraint.
--
-- Rollback strategy:
--   Re-run with the previous ARRAY values (remove heygen_video, button, signal, agent_research, etc.)

ALTER TABLE public.dynamic_table_columns DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

ALTER TABLE public.dynamic_table_columns ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type = ANY (ARRAY[
    'text', 'email', 'url', 'number', 'boolean', 'enrichment', 'status',
    'person', 'company', 'linkedin', 'date', 'dropdown', 'tags', 'phone',
    'checkbox', 'formula', 'integration', 'action', 'hubspot_property',
    'attio_property', 'apollo_property', 'linkedin_property', 'instantly',
    'button', 'signal', 'agent_research', 'heygen_video'
  ])) NOT VALID;
