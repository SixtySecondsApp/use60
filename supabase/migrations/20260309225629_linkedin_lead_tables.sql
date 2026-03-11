-- Migration: linkedin_lead_tables
-- Date: 20260309225629
--
-- What this migration does:
--   Creates tables for LinkedIn Lead Gen webhook integration:
--   linkedin_org_integrations, linkedin_lead_sources, linkedin_sync_runs
--
-- Rollback strategy:
--   DROP TABLE linkedin_sync_runs, linkedin_lead_sources, linkedin_org_integrations CASCADE;

-- 1. Org-level LinkedIn integration config
CREATE TABLE IF NOT EXISTS linkedin_org_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  connected_by_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  is_connected boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  linkedin_ad_account_id text,
  linkedin_ad_account_name text,
  scopes text[] DEFAULT '{}',
  webhook_subscription_ids jsonb DEFAULT '[]',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_org_integrations_org ON linkedin_org_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_org_integrations_ad_account ON linkedin_org_integrations(linkedin_ad_account_name) WHERE is_active = true;

-- 2. Lead sources (forms) — maps form_id to org
CREATE TABLE IF NOT EXISTS linkedin_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  form_id text NOT NULL,
  form_name text,
  source_type text NOT NULL DEFAULT 'ad_form',
  campaign_name text,
  is_active boolean NOT NULL DEFAULT true,
  leads_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_lead_sources_form ON linkedin_lead_sources(form_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_lead_sources_org ON linkedin_lead_sources(org_id) WHERE is_active = true;

-- 3. Sync runs — tracks each webhook batch for idempotency and audit
CREATE TABLE IF NOT EXISTS linkedin_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  run_type text NOT NULL DEFAULT 'webhook',
  notification_id text,
  leads_received integer NOT NULL DEFAULT 0,
  leads_created integer NOT NULL DEFAULT 0,
  leads_matched integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_sync_runs_notification ON linkedin_sync_runs(notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_linkedin_sync_runs_org ON linkedin_sync_runs(org_id);

-- RLS
ALTER TABLE linkedin_org_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_linkedin_org_integrations" ON linkedin_org_integrations;
CREATE POLICY "service_role_linkedin_org_integrations" ON linkedin_org_integrations
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_linkedin_lead_sources" ON linkedin_lead_sources;
CREATE POLICY "service_role_linkedin_lead_sources" ON linkedin_lead_sources
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_linkedin_sync_runs" ON linkedin_sync_runs;
CREATE POLICY "service_role_linkedin_sync_runs" ON linkedin_sync_runs
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "auth_read_linkedin_org_integrations" ON linkedin_org_integrations;
CREATE POLICY "auth_read_linkedin_org_integrations" ON linkedin_org_integrations
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_read_linkedin_lead_sources" ON linkedin_lead_sources;
CREATE POLICY "auth_read_linkedin_lead_sources" ON linkedin_lead_sources
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_read_linkedin_sync_runs" ON linkedin_sync_runs;
CREATE POLICY "auth_read_linkedin_sync_runs" ON linkedin_sync_runs
  FOR SELECT USING (auth.role() = 'authenticated');
