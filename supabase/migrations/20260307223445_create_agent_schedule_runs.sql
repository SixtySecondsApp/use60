-- Migration: create_agent_schedule_runs
-- Date: 20260307223445
--
-- What this migration does:
--   Creates agent_schedule_runs table to log every scheduled agent execution
--   with status, duration, delivery outcome, and error details.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.agent_schedule_runs CASCADE;

CREATE TABLE IF NOT EXISTS public.agent_schedule_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid REFERENCES public.agent_schedules(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL,
  agent_name text NOT NULL,
  user_id uuid,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped', 'catch_up')),
  response_summary text,
  delivery_channel text DEFAULT 'in_app',
  delivered boolean DEFAULT false,
  duration_ms integer,
  error_message text,
  skip_reason text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Fast lookups: org-wide history (most recent first)
CREATE INDEX IF NOT EXISTS idx_agent_schedule_runs_org_created
  ON public.agent_schedule_runs (organization_id, created_at DESC);

-- Per-schedule history
CREATE INDEX IF NOT EXISTS idx_agent_schedule_runs_schedule_created
  ON public.agent_schedule_runs (schedule_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.agent_schedule_runs ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DROP POLICY IF EXISTS "Service role full access to agent_schedule_runs" ON public.agent_schedule_runs;
CREATE POLICY "Service role full access to agent_schedule_runs"
  ON public.agent_schedule_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: read-only for their org
DROP POLICY IF EXISTS "Org members can view schedule runs" ON public.agent_schedule_runs;
CREATE POLICY "Org members can view schedule runs"
  ON public.agent_schedule_runs
  FOR SELECT
  TO authenticated
  USING (public.can_access_org_data(organization_id));
