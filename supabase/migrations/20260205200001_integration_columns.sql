-- Migration: OPS-008 — Integration column type + action column type
-- Adds integration and action to column_type CHECK constraint
-- Adds integration_type, integration_config, action_type, action_config columns
-- Date: 2026-02-05

-- =============================================================================
-- Step 1: Drop existing CHECK constraint and recreate with integration + action
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

ALTER TABLE public.dynamic_table_columns
  ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type IN (
    'text', 'email', 'url', 'number', 'boolean', 'enrichment',
    'status', 'person', 'company', 'linkedin', 'date',
    'dropdown', 'tags', 'phone', 'checkbox', 'formula',
    'integration', 'action'
  ));

-- =============================================================================
-- Step 2: Integration column metadata
-- =============================================================================

-- integration_type: which integration this column uses
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS integration_type TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.integration_type IS
  'Integration provider: reoon_email_verify, apify_actor, apollo_enrich, etc.';

-- integration_config: configuration for the integration (source column, API params, etc.)
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS integration_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.integration_config IS
  'Config for integration column: { source_column_key, api_params, ... }';

-- =============================================================================
-- Step 3: Action column metadata
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.action_type IS
  'Action type: push_to_crm, start_sequence, re_enrich, etc.';

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS action_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.action_config IS
  'Config for action column: { field_mapping, target_list, ... }';

-- =============================================================================
-- Step 4: Integration credentials table (org-scoped)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_provider_per_org UNIQUE(organization_id, provider)
);

COMMENT ON TABLE public.integration_credentials IS 'Org-scoped integration API credentials (Reoon, Apify, etc.)';

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

-- Org members can view credentials
CREATE POLICY "Users can view org integration credentials"
  ON public.integration_credentials
  FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Only admins can manage credentials (via service role or admin check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'integration_credentials' AND policyname = 'Service role full access to integration_credentials'
  ) THEN
    CREATE POLICY "Service role full access to integration_credentials"
      ON public.integration_credentials
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
