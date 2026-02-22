-- Phase 8: Graduated Autonomy System (PRD-24)
-- GRAD-001: Approval rate analytics

-- Materialized view for autonomy analytics per action type
CREATE TABLE IF NOT EXISTS public.autonomy_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  window_days integer NOT NULL DEFAULT 30,
  approval_count integer DEFAULT 0,
  rejection_count integer DEFAULT 0,
  edit_count integer DEFAULT 0,
  auto_approved_count integer DEFAULT 0,
  total_count integer DEFAULT 0,
  approval_rate numeric(5,2) DEFAULT 0,
  calculated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_analytics_per_action UNIQUE (org_id, action_type, window_days)
);

CREATE INDEX idx_autonomy_analytics_org ON public.autonomy_analytics(org_id);
CREATE INDEX idx_autonomy_analytics_action ON public.autonomy_analytics(org_id, action_type);

ALTER TABLE public.autonomy_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view autonomy analytics"
  ON public.autonomy_analytics FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "Service role full access to autonomy_analytics"
  ON public.autonomy_analytics FOR ALL
  USING (auth.role() = 'service_role');

-- RPC to calculate and refresh analytics
CREATE OR REPLACE FUNCTION public.refresh_autonomy_analytics(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window integer;
  v_action text;
  v_action_types text[] := ARRAY['crm_stage_change', 'crm_field_update', 'crm_contact_create', 'send_email', 'send_slack', 'create_task', 'enrich_contact', 'draft_proposal'];
BEGIN
  FOREACH v_action IN ARRAY v_action_types LOOP
    FOREACH v_window IN ARRAY ARRAY[7, 30, 90] LOOP
      INSERT INTO public.autonomy_analytics (org_id, action_type, window_days, approval_count, rejection_count, edit_count, auto_approved_count, total_count, approval_rate, calculated_at)
      SELECT
        p_org_id,
        v_action,
        v_window,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'edited' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN auto_apply = true THEN 1 ELSE 0 END), 0),
        COUNT(*),
        CASE WHEN COUNT(*) > 0
          THEN ROUND((SUM(CASE WHEN status IN ('approved', 'edited') THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric) * 100, 2)
          ELSE 0
        END,
        now()
      FROM public.crm_approval_queue
      WHERE org_id = p_org_id
        AND action_type = v_action
        AND created_at >= now() - (v_window || ' days')::interval
      ON CONFLICT (org_id, action_type, window_days)
      DO UPDATE SET
        approval_count = EXCLUDED.approval_count,
        rejection_count = EXCLUDED.rejection_count,
        edit_count = EXCLUDED.edit_count,
        auto_approved_count = EXCLUDED.auto_approved_count,
        total_count = EXCLUDED.total_count,
        approval_rate = EXCLUDED.approval_rate,
        calculated_at = EXCLUDED.calculated_at;
    END LOOP;
  END LOOP;
END;
$$;

-- RPC to get analytics for all action types
CREATE OR REPLACE FUNCTION public.get_autonomy_analytics(p_org_id uuid, p_window_days integer DEFAULT 30)
RETURNS TABLE (
  action_type text,
  approval_count integer,
  rejection_count integer,
  edit_count integer,
  auto_approved_count integer,
  total_count integer,
  approval_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT action_type, approval_count, rejection_count, edit_count, auto_approved_count, total_count, approval_rate
  FROM public.autonomy_analytics
  WHERE org_id = p_org_id AND window_days = p_window_days
  ORDER BY total_count DESC;
$$;

COMMENT ON TABLE public.autonomy_analytics IS 'Cached approval rate analytics per action type for graduated autonomy (PRD-24)';
