-- Migration: linkedin_lead_tables
-- Date: 20260309211920
--
-- What this migration does:
--   Creates LinkedIn Lead Response Copilot schema:
--   - linkedin_oauth_states (ephemeral CSRF protection)
--   - linkedin_org_integrations (non-sensitive connection metadata)
--   - linkedin_lead_sources (forms/events the user chose to sync)
--   - linkedin_sync_runs (audit + reconciliation history)
--   - Contact columns: linkedin_lead_source_id, linkedin_lead_payload, linkedin_lead_received_at
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS linkedin_sync_runs, linkedin_lead_sources, linkedin_org_integrations, linkedin_oauth_states CASCADE;
--   ALTER TABLE contacts DROP COLUMN IF EXISTS linkedin_lead_source_id, DROP COLUMN IF EXISTS linkedin_lead_payload, DROP COLUMN IF EXISTS linkedin_lead_received_at;

-- ============================================================
-- 1. LinkedIn OAuth States (ephemeral, CSRF protection)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linkedin_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  redirect_uri text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_oauth_states_state ON public.linkedin_oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_linkedin_oauth_states_expires ON public.linkedin_oauth_states(expires_at);

ALTER TABLE public.linkedin_oauth_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only for linkedin_oauth_states" ON public.linkedin_oauth_states;
CREATE POLICY "Service role only for linkedin_oauth_states"
  ON public.linkedin_oauth_states
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 2. LinkedIn Org Integrations (non-sensitive metadata)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linkedin_org_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connected_by_user_id uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true,
  is_connected boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  linkedin_ad_account_id text,
  linkedin_ad_account_name text,
  scopes text[] DEFAULT '{}',
  webhook_subscription_ids jsonb DEFAULT '[]',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linkedin_org_integrations_org_id_key UNIQUE (org_id)
);

ALTER TABLE public.linkedin_org_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can view linkedin integrations" ON public.linkedin_org_integrations;
CREATE POLICY "Org members can view linkedin integrations"
  ON public.linkedin_org_integrations
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. LinkedIn Lead Sources (forms/events the user chose to sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linkedin_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  form_name text,
  source_type text NOT NULL CHECK (source_type IN ('ad_form', 'event_form')),
  event_id text,
  campaign_name text,
  is_active boolean NOT NULL DEFAULT true,
  webhook_notification_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linkedin_lead_sources_org_form_key UNIQUE (org_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_lead_sources_org ON public.linkedin_lead_sources(org_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_lead_sources_active ON public.linkedin_lead_sources(org_id, is_active) WHERE is_active = true;

ALTER TABLE public.linkedin_lead_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can view linkedin lead sources" ON public.linkedin_lead_sources;
CREATE POLICY "Org members can view linkedin lead sources"
  ON public.linkedin_lead_sources
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org admins can manage linkedin lead sources" ON public.linkedin_lead_sources;
CREATE POLICY "Org admins can manage linkedin lead sources"
  ON public.linkedin_lead_sources
  FOR ALL
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 4. LinkedIn Sync Runs (audit + reconciliation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linkedin_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_type text NOT NULL CHECK (run_type IN ('webhook', 'poll_reconciliation')),
  notification_id text,
  leads_received integer NOT NULL DEFAULT 0,
  leads_created integer NOT NULL DEFAULT 0,
  leads_matched integer NOT NULL DEFAULT 0,
  leads_duplicate integer NOT NULL DEFAULT 0,
  leads_failed integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_sync_runs_org ON public.linkedin_sync_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_sync_runs_notification ON public.linkedin_sync_runs(notification_id);

ALTER TABLE public.linkedin_sync_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can view linkedin sync runs" ON public.linkedin_sync_runs;
CREATE POLICY "Org members can view linkedin sync runs"
  ON public.linkedin_sync_runs
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. Contact source columns for LinkedIn leads
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'linkedin_lead_source_id'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN linkedin_lead_source_id uuid REFERENCES public.linkedin_lead_sources(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'linkedin_lead_payload'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN linkedin_lead_payload jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'linkedin_lead_received_at'
  ) THEN
    ALTER TABLE public.contacts ADD COLUMN linkedin_lead_received_at timestamptz;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_contacts_linkedin_lead_source ON public.contacts(linkedin_lead_source_id)
  WHERE linkedin_lead_source_id IS NOT NULL;
