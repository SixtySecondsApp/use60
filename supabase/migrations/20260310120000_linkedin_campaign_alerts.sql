-- Migration: linkedin_campaign_alerts
-- Date: 20260310120000
--
-- What this migration does:
--   Creates linkedin_campaign_alerts table for anomaly detection results.
--   Stores detected anomalies like cost spikes, CTR drops, lead volume declines.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.linkedin_campaign_alerts;

CREATE TABLE IF NOT EXISTS public.linkedin_campaign_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  campaign_id uuid REFERENCES public.linkedin_managed_campaigns(id),
  alert_type text NOT NULL, -- 'cost_spike', 'ctr_drop', 'lead_decline', 'quality_decline'
  severity text NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  title text NOT NULL,
  description text,
  metric_name text, -- which metric triggered the alert
  metric_value numeric, -- current value
  baseline_value numeric, -- expected/historical value
  change_percent numeric, -- % change
  suggested_action text, -- 'pause', 'adjust_targeting', 'review_creative', 'increase_budget'
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying alerts by org, newest first
CREATE INDEX IF NOT EXISTS idx_linkedin_campaign_alerts_org_created
  ON public.linkedin_campaign_alerts (org_id, created_at DESC);

-- Index for querying alerts by campaign
CREATE INDEX IF NOT EXISTS idx_linkedin_campaign_alerts_campaign
  ON public.linkedin_campaign_alerts (campaign_id);

-- Enable RLS
ALTER TABLE public.linkedin_campaign_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: org members can SELECT their org's alerts
DROP POLICY IF EXISTS "org_members_select_campaign_alerts" ON public.linkedin_campaign_alerts;
CREATE POLICY "org_members_select_campaign_alerts"
  ON public.linkedin_campaign_alerts
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS: org admins can UPDATE (e.g. mark as resolved)
DROP POLICY IF EXISTS "org_admins_update_campaign_alerts" ON public.linkedin_campaign_alerts;
CREATE POLICY "org_admins_update_campaign_alerts"
  ON public.linkedin_campaign_alerts
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
  );

-- RLS: service role inserts via edge functions (no user context).
-- The anomaly detection handler uses service_role key, which bypasses RLS.
-- No INSERT policy needed for regular users — only service role inserts.
