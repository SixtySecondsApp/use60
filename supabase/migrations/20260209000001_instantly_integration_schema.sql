-- Migration: Instantly.ai Integration Schema
-- Purpose: Credential storage, integration metadata, campaign links, sync history
-- Date: 2026-02-09

-- =============================================================================
-- Step 1: instantly_org_credentials — Service-role-only API key storage
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.instantly_org_credentials (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.instantly_org_credentials IS 'Org-scoped Instantly.ai API key (service-role-only). Bearer token auth.';

-- RLS: service-role-only (no user access)
ALTER TABLE public.instantly_org_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "instantly_org_credentials_service_all"
  ON public.instantly_org_credentials
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at
CREATE TRIGGER update_instantly_org_credentials_updated_at
  BEFORE UPDATE ON public.instantly_org_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Step 2: instantly_org_integrations — Public integration metadata
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.instantly_org_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT instantly_org_integrations_org_id_unique UNIQUE (org_id)
);

COMMENT ON TABLE public.instantly_org_integrations IS 'Org-scoped Instantly.ai integration metadata (non-sensitive).';

-- RLS: org members can read, admins can write
ALTER TABLE public.instantly_org_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "instantly_org_integrations_select"
  ON public.instantly_org_integrations
  FOR SELECT
  USING (public.is_service_role() OR public.can_access_org_data(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "instantly_org_integrations_admin_all"
  ON public.instantly_org_integrations
  USING (public.is_service_role() OR public.can_admin_org(org_id))
  WITH CHECK (public.is_service_role() OR public.can_admin_org(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at
CREATE TRIGGER update_instantly_org_integrations_updated_at
  BEFORE UPDATE ON public.instantly_org_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_instantly_org_integrations_org_id
  ON public.instantly_org_integrations(org_id) WHERE is_active = true;

-- =============================================================================
-- Step 3: instantly_campaign_links — Maps Ops tables to Instantly campaigns
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.instantly_campaign_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_sync_engagement BOOLEAN NOT NULL DEFAULT false,
  linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_push_at TIMESTAMPTZ,
  last_engagement_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT instantly_campaign_links_table_campaign_unique UNIQUE (table_id, campaign_id)
);

COMMENT ON TABLE public.instantly_campaign_links IS 'Maps Ops tables to Instantly campaigns with field mapping configuration.';
COMMENT ON COLUMN public.instantly_campaign_links.field_mapping IS 'Maps Ops column keys to Instantly lead fields: { email: "col_key", first_name: "col_key", custom_variables: { "title": "col_key" } }';

-- RLS
ALTER TABLE public.instantly_campaign_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "instantly_campaign_links_select"
  ON public.instantly_campaign_links
  FOR SELECT
  USING (
    public.is_service_role() OR
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "instantly_campaign_links_service_all"
  ON public.instantly_campaign_links
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update
CREATE TRIGGER update_instantly_campaign_links_updated_at
  BEFORE UPDATE ON public.instantly_campaign_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_instantly_campaign_links_table_id
  ON public.instantly_campaign_links(table_id);

CREATE INDEX idx_instantly_campaign_links_org_id
  ON public.instantly_campaign_links(org_id);

-- =============================================================================
-- Step 4: instantly_sync_history — Tracks engagement sync operations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.instantly_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  synced_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sync stats
  new_leads_count INTEGER NOT NULL DEFAULT 0,
  updated_leads_count INTEGER NOT NULL DEFAULT 0,
  pushed_leads_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  sync_type TEXT NOT NULL DEFAULT 'engagement_pull' CHECK (sync_type IN ('engagement_pull', 'lead_push')),
  sync_duration_ms INTEGER,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.instantly_sync_history IS 'Tracks Instantly sync operations (both push and engagement pull).';

-- RLS
ALTER TABLE public.instantly_sync_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "instantly_sync_history_select"
  ON public.instantly_sync_history
  FOR SELECT
  USING (
    public.is_service_role() OR
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "instantly_sync_history_service_all"
  ON public.instantly_sync_history
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX idx_instantly_sync_history_table_id
  ON public.instantly_sync_history(table_id, synced_at DESC);

-- =============================================================================
-- Step 5: Add instantly_lead_id tracking to dynamic_table_rows
-- =============================================================================

ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS instantly_lead_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_rows.instantly_lead_id IS
  'Instantly lead ID for rows pushed to Instantly. Used for engagement sync matching.';

CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_instantly_lead_id
  ON public.dynamic_table_rows(instantly_lead_id)
  WHERE instantly_lead_id IS NOT NULL;

-- =============================================================================
-- Step 6: Add instantly_last_pushed_at to dynamic_table_cells
-- =============================================================================

ALTER TABLE public.dynamic_table_cells
  ADD COLUMN IF NOT EXISTS instantly_last_pushed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_cells.instantly_last_pushed_at IS
  'Last time this cell was synced from Instantly engagement data. Used for conflict resolution.';

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT ALL ON TABLE public.instantly_org_credentials TO anon;
GRANT ALL ON TABLE public.instantly_org_credentials TO authenticated;
GRANT ALL ON TABLE public.instantly_org_credentials TO service_role;

GRANT ALL ON TABLE public.instantly_org_integrations TO anon;
GRANT ALL ON TABLE public.instantly_org_integrations TO authenticated;
GRANT ALL ON TABLE public.instantly_org_integrations TO service_role;

GRANT ALL ON TABLE public.instantly_campaign_links TO anon;
GRANT ALL ON TABLE public.instantly_campaign_links TO authenticated;
GRANT ALL ON TABLE public.instantly_campaign_links TO service_role;

GRANT ALL ON TABLE public.instantly_sync_history TO anon;
GRANT ALL ON TABLE public.instantly_sync_history TO authenticated;
GRANT ALL ON TABLE public.instantly_sync_history TO service_role;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
