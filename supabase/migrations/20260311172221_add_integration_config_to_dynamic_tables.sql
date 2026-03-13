-- Migration: add_integration_config_to_dynamic_tables
-- Date: 20260311172221
--
-- What this migration does:
--   Adds `integration_config` JSONB column to `dynamic_tables` so that
--   table-level integration bindings (e.g. LinkedIn campaign, Instantly list)
--   can be stored without creating an extra column per row.
--
--   This is distinct from `dynamic_table_columns.integration_config` which
--   stores column-scoped integration settings. The new column is table-scoped.
--
--   Initial usage: LinkedIn Ops Ads Pipeline (US-006) stores campaign binding:
--     { linkedin: { campaign_group_id, campaign_id, structure } }
--
-- Rollback strategy:
--   ALTER TABLE public.dynamic_tables DROP COLUMN IF EXISTS integration_config;

ALTER TABLE public.dynamic_tables
  ADD COLUMN IF NOT EXISTS integration_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_tables.integration_config IS
  'Table-level integration bindings keyed by integration name. '
  'Example: { "linkedin": { "campaign_group_id": "...", "campaign_id": "...", "structure": "single_campaign" } }';

NOTIFY pgrst, 'reload schema';
