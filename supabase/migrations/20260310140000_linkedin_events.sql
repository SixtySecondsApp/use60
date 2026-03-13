-- Migration: linkedin_events
-- Date: 20260310140000
--
-- What this migration does:
--   Creates tables for LinkedIn Events integration (Phase 4):
--   linkedin_event_connections, linkedin_events, linkedin_event_registrants,
--   linkedin_event_sync_runs. Supports event-to-pipeline tracking.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.linkedin_event_sync_runs;
--   DROP TABLE IF EXISTS public.linkedin_event_registrants;
--   DROP TABLE IF EXISTS public.linkedin_events;
--   DROP TABLE IF EXISTS public.linkedin_event_connections;

-- Event connection config (which LinkedIn events to sync)
CREATE TABLE IF NOT EXISTS public.linkedin_event_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  linkedin_event_id text NOT NULL,
  event_name text,
  event_url text,
  is_active boolean NOT NULL DEFAULT true,
  sync_frequency text NOT NULL DEFAULT 'daily',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, linkedin_event_id)
);

-- Event details
CREATE TABLE IF NOT EXISTS public.linkedin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  connection_id uuid REFERENCES public.linkedin_event_connections(id),
  linkedin_event_id text NOT NULL,
  event_name text NOT NULL,
  event_description text,
  event_url text,
  event_type text, -- 'ONLINE', 'IN_PERSON', 'HYBRID'
  start_date timestamptz,
  end_date timestamptz,
  organizer_name text,
  registrant_count integer DEFAULT 0,
  attendee_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, linkedin_event_id)
);

-- Event registrants
CREATE TABLE IF NOT EXISTS public.linkedin_event_registrants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  event_id uuid NOT NULL REFERENCES public.linkedin_events(id),
  linkedin_member_id text,
  first_name text,
  last_name text,
  email text,
  company text,
  job_title text,
  linkedin_url text,
  registration_status text NOT NULL DEFAULT 'registered', -- 'registered', 'attended', 'no_show', 'cancelled'
  priority_tier text DEFAULT 'cold', -- 'hot', 'warm', 'cold'
  icp_score numeric,
  matched_contact_id uuid, -- FK to contacts table if matched
  matched_company_id uuid, -- FK to companies table if matched
  followup_status text DEFAULT 'pending', -- 'pending', 'drafted', 'sent', 'replied'
  followup_draft text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, linkedin_member_id)
);

-- Event sync runs
CREATE TABLE IF NOT EXISTS public.linkedin_event_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  connection_id uuid REFERENCES public.linkedin_event_connections(id),
  status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  registrants_synced integer DEFAULT 0,
  new_registrants integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_linkedin_events_org ON public.linkedin_events (org_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_event_registrants_event ON public.linkedin_event_registrants (event_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_event_registrants_org ON public.linkedin_event_registrants (org_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_event_registrants_priority ON public.linkedin_event_registrants (org_id, priority_tier);
CREATE INDEX IF NOT EXISTS idx_linkedin_event_sync_runs_org ON public.linkedin_event_sync_runs (org_id, started_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.linkedin_event_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_event_registrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_event_sync_runs ENABLE ROW LEVEL SECURITY;

-- RLS: org members SELECT
DROP POLICY IF EXISTS "org_members_select_event_connections" ON public.linkedin_event_connections;
CREATE POLICY "org_members_select_event_connections" ON public.linkedin_event_connections
  FOR SELECT USING (org_id IN (SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_select_events" ON public.linkedin_events;
CREATE POLICY "org_members_select_events" ON public.linkedin_events
  FOR SELECT USING (org_id IN (SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_select_event_registrants" ON public.linkedin_event_registrants;
CREATE POLICY "org_members_select_event_registrants" ON public.linkedin_event_registrants
  FOR SELECT USING (org_id IN (SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()));

DROP POLICY IF EXISTS "org_members_select_event_sync_runs" ON public.linkedin_event_sync_runs;
CREATE POLICY "org_members_select_event_sync_runs" ON public.linkedin_event_sync_runs
  FOR SELECT USING (org_id IN (SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()));

-- RLS: org admins INSERT/UPDATE event connections
DROP POLICY IF EXISTS "org_admins_insert_event_connections" ON public.linkedin_event_connections;
CREATE POLICY "org_admins_insert_event_connections" ON public.linkedin_event_connections
  FOR INSERT WITH CHECK (org_id IN (
    SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'owner')
  ));

DROP POLICY IF EXISTS "org_admins_update_event_connections" ON public.linkedin_event_connections;
CREATE POLICY "org_admins_update_event_connections" ON public.linkedin_event_connections
  FOR UPDATE USING (org_id IN (
    SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'owner')
  ));

-- RLS: org members can UPDATE registrant followup fields
DROP POLICY IF EXISTS "org_members_update_event_registrants" ON public.linkedin_event_registrants;
CREATE POLICY "org_members_update_event_registrants" ON public.linkedin_event_registrants
  FOR UPDATE USING (org_id IN (
    SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()
  ));
