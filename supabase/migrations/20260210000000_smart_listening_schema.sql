-- Migration: Smart Listening — Account Intelligence & Intent Signals
-- Purpose: Watchlist, signals, and snapshots tables for proactive account monitoring
-- Date: 2026-02-10

-- =============================================================================
-- Step 1: account_watchlist — Accounts to monitor for intent signals
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.account_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What to watch
  account_type TEXT NOT NULL CHECK (account_type IN ('company', 'contact')),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,

  -- How it was added
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'deal_auto')),

  -- Monitoring config
  monitor_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (monitor_frequency IN ('weekly', 'twice_weekly', 'daily')),
  monitor_day TEXT NOT NULL DEFAULT 'monday' CHECK (monitor_day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  enabled_sources TEXT[] NOT NULL DEFAULT ARRAY['apollo'],
  custom_research_prompt TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate watches per user per entity
  CONSTRAINT account_watchlist_unique_company UNIQUE (org_id, user_id, company_id),
  CONSTRAINT account_watchlist_unique_contact UNIQUE (org_id, user_id, contact_id),
  -- Ensure correct type/FK pairing
  CONSTRAINT account_watchlist_type_check CHECK (
    (account_type = 'company' AND company_id IS NOT NULL AND contact_id IS NULL) OR
    (account_type = 'contact' AND contact_id IS NOT NULL AND company_id IS NULL)
  )
);

COMMENT ON TABLE public.account_watchlist IS 'Accounts monitored by Smart Listening for intent signals (job changes, news, funding, custom research).';

-- RLS
ALTER TABLE public.account_watchlist ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own watchlist entries
CREATE POLICY "account_watchlist_user_select"
  ON public.account_watchlist
  FOR SELECT
  USING (
    public.is_service_role()
    OR auth.uid() = user_id
    OR public.can_admin_org(org_id)
  );

CREATE POLICY "account_watchlist_user_insert"
  ON public.account_watchlist
  FOR INSERT
  WITH CHECK (
    public.is_service_role()
    OR (auth.uid() = user_id AND public.can_access_org_data(org_id))
  );

CREATE POLICY "account_watchlist_user_update"
  ON public.account_watchlist
  FOR UPDATE
  USING (
    public.is_service_role()
    OR auth.uid() = user_id
  )
  WITH CHECK (
    public.is_service_role()
    OR auth.uid() = user_id
  );

CREATE POLICY "account_watchlist_user_delete"
  ON public.account_watchlist
  FOR DELETE
  USING (
    public.is_service_role()
    OR auth.uid() = user_id
  );

-- Auto-update updated_at
CREATE TRIGGER update_account_watchlist_updated_at
  BEFORE UPDATE ON public.account_watchlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_account_watchlist_org_active
  ON public.account_watchlist(org_id, is_active) WHERE is_active = true;

CREATE INDEX idx_account_watchlist_next_check
  ON public.account_watchlist(next_check_at ASC)
  WHERE is_active = true AND next_check_at IS NOT NULL;

CREATE INDEX idx_account_watchlist_user
  ON public.account_watchlist(user_id, is_active) WHERE is_active = true;

-- =============================================================================
-- Step 2: account_signals — Detected intent signals from monitoring
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.account_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  watchlist_id UUID NOT NULL REFERENCES public.account_watchlist(id) ON DELETE CASCADE,

  -- Signal classification
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'job_change', 'title_change', 'company_change',
    'funding_event', 'company_news', 'hiring_surge',
    'tech_stack_change', 'competitor_mention',
    'custom_research_result'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  relevance_score INT CHECK (relevance_score BETWEEN 0 AND 100),

  -- Content
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  evidence TEXT,
  recommended_action TEXT,

  -- Source tracking
  source TEXT NOT NULL CHECK (source IN ('apollo_diff', 'web_intel', 'custom_prompt')),
  source_data JSONB DEFAULT '{}',

  -- State
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  is_actioned BOOLEAN NOT NULL DEFAULT false,
  actioned_at TIMESTAMPTZ,

  -- Notification tracking
  slack_notified BOOLEAN NOT NULL DEFAULT false,
  in_app_notified BOOLEAN NOT NULL DEFAULT false,

  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.account_signals IS 'Intent signals detected by Smart Listening (job changes, funding, news, custom research results).';

-- RLS
ALTER TABLE public.account_signals ENABLE ROW LEVEL SECURITY;

-- Users can read signals for their own watchlist entries; admins can see all org signals
CREATE POLICY "account_signals_select"
  ON public.account_signals
  FOR SELECT
  USING (
    public.is_service_role()
    OR EXISTS (
      SELECT 1 FROM public.account_watchlist aw
      WHERE aw.id = watchlist_id AND aw.user_id = auth.uid()
    )
    OR public.can_admin_org(org_id)
  );

-- Only service role (cron) inserts signals
CREATE POLICY "account_signals_service_insert"
  ON public.account_signals
  FOR INSERT
  WITH CHECK (public.is_service_role());

-- Users can update read/dismissed/actioned state on their own signals
CREATE POLICY "account_signals_user_update"
  ON public.account_signals
  FOR UPDATE
  USING (
    public.is_service_role()
    OR EXISTS (
      SELECT 1 FROM public.account_watchlist aw
      WHERE aw.id = watchlist_id AND aw.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_service_role()
    OR EXISTS (
      SELECT 1 FROM public.account_watchlist aw
      WHERE aw.id = watchlist_id AND aw.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_account_signals_watchlist_date
  ON public.account_signals(watchlist_id, detected_at DESC);

CREATE INDEX idx_account_signals_org_date
  ON public.account_signals(org_id, detected_at DESC);

CREATE INDEX idx_account_signals_unread
  ON public.account_signals(org_id, is_read)
  WHERE is_read = false AND is_dismissed = false;

CREATE INDEX idx_account_signals_severity
  ON public.account_signals(org_id, severity, detected_at DESC)
  WHERE severity IN ('high', 'critical') AND is_dismissed = false;

-- =============================================================================
-- Step 3: account_signal_snapshots — Enrichment snapshots for change diffing
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.account_signal_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES public.account_watchlist(id) ON DELETE CASCADE,

  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('apollo_person', 'apollo_org', 'web_intel')),
  snapshot_data JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.account_signal_snapshots IS 'Point-in-time enrichment snapshots for detecting changes between monitoring runs.';

-- RLS: service-role-only (cron writes/reads snapshots)
ALTER TABLE public.account_signal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_signal_snapshots_service_all"
  ON public.account_signal_snapshots
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

-- Index for efficient snapshot retrieval (latest per watchlist+type)
CREATE INDEX idx_account_signal_snapshots_lookup
  ON public.account_signal_snapshots(watchlist_id, snapshot_type, created_at DESC);
