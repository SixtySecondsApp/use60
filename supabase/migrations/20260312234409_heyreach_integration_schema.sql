-- Migration: HeyReach LinkedIn Automation Integration Schema
-- Date: 20260312234409
--
-- What this migration does:
--   Creates credential storage, integration metadata, campaign links, sync history
--   tables for HeyReach integration. Extends source_type and ops_rules constraints.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS heyreach_sync_history;
--   DROP TABLE IF EXISTS heyreach_campaign_links;
--   DROP TABLE IF EXISTS heyreach_org_integrations;
--   DROP TABLE IF EXISTS heyreach_org_credentials;
--   ALTER TABLE dynamic_table_rows DROP COLUMN IF EXISTS heyreach_lead_id;

-- =============================================================================
-- Step 1: heyreach_org_credentials — Service-role-only API key storage
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.heyreach_org_credentials (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.heyreach_org_credentials IS 'Org-scoped HeyReach API key (service-role-only). X-API-KEY header auth.';

ALTER TABLE public.heyreach_org_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "heyreach_org_credentials_service_all"
  ON public.heyreach_org_credentials
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TRIGGER update_heyreach_org_credentials_updated_at
  BEFORE UPDATE ON public.heyreach_org_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Step 2: heyreach_org_integrations — Public integration metadata
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.heyreach_org_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_webhook_received_at TIMESTAMPTZ,
  webhook_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT heyreach_org_integrations_org_id_unique UNIQUE (org_id)
);

COMMENT ON TABLE public.heyreach_org_integrations IS 'Org-scoped HeyReach integration metadata. Tracks connection status and webhook health.';

ALTER TABLE public.heyreach_org_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "heyreach_org_integrations_select"
  ON public.heyreach_org_integrations
  FOR SELECT
  USING (public.is_service_role() OR public.can_access_org_data(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "heyreach_org_integrations_admin_all"
  ON public.heyreach_org_integrations
  USING (public.is_service_role() OR public.can_admin_org(org_id))
  WITH CHECK (public.is_service_role() OR public.can_admin_org(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TRIGGER update_heyreach_org_integrations_updated_at
  BEFORE UPDATE ON public.heyreach_org_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_heyreach_org_integrations_org_id
  ON public.heyreach_org_integrations(org_id) WHERE is_active = true;

-- =============================================================================
-- Step 3: heyreach_campaign_links — Maps Ops tables to HeyReach campaigns
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.heyreach_campaign_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  sender_column_key TEXT,
  auto_sync_engagement BOOLEAN NOT NULL DEFAULT true,
  linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_push_at TIMESTAMPTZ,
  last_engagement_sync_at TIMESTAMPTZ,
  sync_schedule JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT heyreach_campaign_links_table_campaign_unique UNIQUE (table_id, campaign_id)
);

COMMENT ON TABLE public.heyreach_campaign_links IS 'Maps Ops tables to HeyReach campaigns with field mapping and sender assignment.';
COMMENT ON COLUMN public.heyreach_campaign_links.field_mapping IS 'Maps HeyReach fields to Ops column keys: { first_name: "col_key", last_name: "col_key", linkedin_url: "col_key" }';
COMMENT ON COLUMN public.heyreach_campaign_links.sender_column_key IS 'Ops column key for per-row LinkedIn sender assignment. Null = HeyReach default rotation.';
COMMENT ON COLUMN public.heyreach_campaign_links.sync_schedule IS 'Scheduled sync: { frequency, filter, is_enabled, last_scheduled_run_at }';

ALTER TABLE public.heyreach_campaign_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "heyreach_campaign_links_select"
  ON public.heyreach_campaign_links
  FOR SELECT
  USING (
    public.is_service_role() OR
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE organization_id IN (
        SELECT om.org_id FROM public.organization_memberships om
        WHERE om.user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "heyreach_campaign_links_service_all"
  ON public.heyreach_campaign_links
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TRIGGER update_heyreach_campaign_links_updated_at
  BEFORE UPDATE ON public.heyreach_campaign_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_heyreach_campaign_links_table_id
  ON public.heyreach_campaign_links(table_id);

CREATE INDEX idx_heyreach_campaign_links_org_id
  ON public.heyreach_campaign_links(org_id);

-- =============================================================================
-- Step 4: heyreach_sync_history — Tracks sync operations and webhook events
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.heyreach_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  campaign_id TEXT,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  synced_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  rows_processed INTEGER NOT NULL DEFAULT 0,
  rows_succeeded INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,

  sync_type TEXT NOT NULL DEFAULT 'webhook_event' CHECK (sync_type IN ('engagement_pull', 'lead_push', 'webhook_event')),
  sync_duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.heyreach_sync_history IS 'Tracks HeyReach sync operations (push, pull, and webhook events).';

ALTER TABLE public.heyreach_sync_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "heyreach_sync_history_select"
  ON public.heyreach_sync_history
  FOR SELECT
  USING (
    public.is_service_role() OR
    org_id IN (
      SELECT om.org_id FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "heyreach_sync_history_service_all"
  ON public.heyreach_sync_history
  FOR ALL
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX idx_heyreach_sync_history_org_id
  ON public.heyreach_sync_history(org_id, synced_at DESC);

CREATE INDEX idx_heyreach_sync_history_table_id
  ON public.heyreach_sync_history(table_id, synced_at DESC);

-- =============================================================================
-- Step 5: Add heyreach_lead_id to dynamic_table_rows
-- =============================================================================

ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS heyreach_lead_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_rows.heyreach_lead_id IS
  'HeyReach lead ID for rows pushed to HeyReach campaigns. Used for engagement sync matching.';

CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_heyreach_lead_id
  ON public.dynamic_table_rows(heyreach_lead_id)
  WHERE heyreach_lead_id IS NOT NULL;

-- =============================================================================
-- Step 6: Extend dynamic_table_rows source_type CHECK to include 'heyreach'
-- =============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE c.contype = 'c'
    AND n.nspname = 'public'
    AND r.relname = 'dynamic_table_rows'
    AND pg_get_constraintdef(c.oid) LIKE '%source_type%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dynamic_table_rows DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.dynamic_table_rows
  ADD CONSTRAINT dynamic_table_rows_source_type_check
  CHECK (source_type IN ('manual', 'hubspot', 'attio', 'app', 'webhook', 'heyreach'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 7: Extend dynamic_tables source_type CHECK to include 'heyreach'
-- =============================================================================

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN (
    'manual', 'apollo', 'csv', 'copilot',
    'hubspot', 'attio', 'ops_table', 'standard',
    'ai_ark', 'explorium', 'heyreach'
  ));

-- =============================================================================
-- Step 8: Extend ops_rules trigger_type CHECK to include HeyReach events
-- =============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE c.contype = 'c'
    AND n.nspname = 'public'
    AND r.relname = 'ops_rules'
    AND pg_get_constraintdef(c.oid) LIKE '%trigger_type%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ops_rules DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ops_rules
  ADD CONSTRAINT ops_rules_trigger_type_check
  CHECK (trigger_type IN (
    'cell_updated', 'enrichment_complete', 'row_created',
    'heyreach_connection_sent', 'heyreach_connection_accepted',
    'heyreach_message_sent', 'heyreach_reply_received',
    'heyreach_inmail_sent', 'heyreach_inmail_reply_received',
    'heyreach_follow_sent', 'heyreach_liked_post',
    'heyreach_viewed_profile', 'heyreach_tag_updated'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 9: Extend ops_rules action_type CHECK to include push_to_heyreach
-- =============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE c.contype = 'c'
    AND n.nspname = 'public'
    AND r.relname = 'ops_rules'
    AND pg_get_constraintdef(c.oid) LIKE '%action_type%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ops_rules DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ops_rules
  ADD CONSTRAINT ops_rules_action_type_check
  CHECK (action_type IN (
    'update_cell', 'run_enrichment', 'push_to_hubspot', 'add_tag', 'notify', 'webhook',
    'push_to_heyreach'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Grants
-- =============================================================================

GRANT ALL ON TABLE public.heyreach_org_credentials TO anon;
GRANT ALL ON TABLE public.heyreach_org_credentials TO authenticated;
GRANT ALL ON TABLE public.heyreach_org_credentials TO service_role;

GRANT ALL ON TABLE public.heyreach_org_integrations TO anon;
GRANT ALL ON TABLE public.heyreach_org_integrations TO authenticated;
GRANT ALL ON TABLE public.heyreach_org_integrations TO service_role;

GRANT ALL ON TABLE public.heyreach_campaign_links TO anon;
GRANT ALL ON TABLE public.heyreach_campaign_links TO authenticated;
GRANT ALL ON TABLE public.heyreach_campaign_links TO service_role;

GRANT ALL ON TABLE public.heyreach_sync_history TO anon;
GRANT ALL ON TABLE public.heyreach_sync_history TO authenticated;
GRANT ALL ON TABLE public.heyreach_sync_history TO service_role;

NOTIFY pgrst, 'reload schema';
