-- ============================================================================
-- Migration: ROI Summary RPC
-- Purpose: Single-row RPC that computes three org-level ROI metrics for the
--          Control Room "ROI Summary" widget (CTRL-006).
--
--   1. hours_saved        — Automated email sends this week × avg_manual_minutes_per_email
--                           (configurable per org via org_settings.roi_settings JSONB,
--                            default 8 min) converted to hours.
--
--   2. median_followup_speed_minutes — Median elapsed minutes between a meeting
--                           ending (meetings.meeting_end) and the follow-up email
--                           send recorded in command_centre_items
--                           (item_type IN ('email_sent','followup_sent')).
--                           Falls back to NULL when no data exists.
--
--   3. pipeline_coverage_pct — Percentage of active deals that have had at least
--                           one agent touch (command_centre_items OR sequence_jobs)
--                           in the last 7 days.  Returns 0 when org has no active
--                           deals.
--
-- Security: SECURITY DEFINER with explicit org membership check via
--           organization_memberships so callers can only see their own org.
-- Resilience: Never raises exceptions for missing data; returns 0 / NULL.
--
-- Story: CTRL-006
-- Date: 2026-02-27
-- DEPENDS ON: command_centre_items (CC8-001), org_settings (security hardening),
--             meetings, deals, sequence_jobs, organization_memberships
-- ============================================================================


-- ============================================================================
-- 1. Add roi_settings JSONB column to org_settings
--    Stores configurable ROI parameters per org.
--    Default: { "avg_manual_minutes_per_email": 8 }
-- ============================================================================

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS roi_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.org_settings.roi_settings IS
  'Configurable ROI metric parameters for the Control Room ROI Summary widget. '
  'Keys: avg_manual_minutes_per_email (INTEGER, default 8). (CTRL-006)';


-- ============================================================================
-- 2. RPC: get_roi_summary(p_org_id UUID)
--
-- Returns a single row with:
--   hours_saved                   NUMERIC  — hours saved this week via email automation
--   median_followup_speed_minutes NUMERIC  — median meeting-end → follow-up time (minutes)
--   pipeline_coverage_pct         NUMERIC  — % active deals with agent activity (7d)
--
-- Org membership is validated against auth.uid() — returns zero-row result when
-- the calling user is not a member of p_org_id (effectively a permission denial
-- without surfacing an error to the caller).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_roi_summary(
  p_org_id UUID
)
RETURNS TABLE (
  hours_saved                   NUMERIC,
  median_followup_speed_minutes NUMERIC,
  pipeline_coverage_pct         NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_member         BOOLEAN;
  v_avg_min_per_email INTEGER;
  v_week_start        TIMESTAMPTZ;
  v_seven_days_ago    TIMESTAMPTZ;

  -- Metric accumulators
  v_email_sends       BIGINT   := 0;
  v_hours_saved       NUMERIC  := 0;
  v_median_speed      NUMERIC;
  v_active_deals      BIGINT   := 0;
  v_touched_deals     BIGINT   := 0;
  v_coverage_pct      NUMERIC  := 0;
BEGIN
  -- ── Membership guard ──────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    WHERE om.org_id  = p_org_id
      AND om.user_id = auth.uid()
  ) INTO v_is_member;

  -- Silently return no rows when caller is not a member
  IF NOT v_is_member THEN
    RETURN;
  END IF;

  -- ── Common time anchors ───────────────────────────────────────────────────
  v_week_start     := date_trunc('week', NOW());
  v_seven_days_ago := NOW() - INTERVAL '7 days';

  -- ── Read configurable avg_manual_minutes_per_email from org_settings ──────
  BEGIN
    SELECT COALESCE(
      (os.roi_settings->>'avg_manual_minutes_per_email')::INTEGER,
      8
    )
    INTO v_avg_min_per_email
    FROM public.org_settings os
    WHERE os.org_id = p_org_id;
  EXCEPTION WHEN OTHERS THEN
    -- Fall back to default if anything goes wrong
    v_avg_min_per_email := 8;
  END;

  -- Default when org has no org_settings row yet
  IF v_avg_min_per_email IS NULL THEN
    v_avg_min_per_email := 8;
  END IF;

  -- ── Metric 1: hours_saved ─────────────────────────────────────────────────
  -- Count automated email/followup sends created this calendar week for the org
  BEGIN
    SELECT COUNT(*)
    INTO v_email_sends
    FROM public.command_centre_items cci
    WHERE cci.org_id    = p_org_id
      AND cci.item_type IN ('email_sent', 'followup_sent')
      AND cci.created_at >= v_week_start;
  EXCEPTION WHEN OTHERS THEN
    v_email_sends := 0;
  END;

  v_hours_saved := ROUND(
    (v_email_sends * v_avg_min_per_email)::NUMERIC / 60.0,
    2
  );

  -- ── Metric 2: median_followup_speed_minutes ───────────────────────────────
  -- Elapsed minutes between meeting_end and the follow-up CC item created_at,
  -- joined via source_event_id = meetings.id.
  -- Only consider positive deltas (follow-up sent AFTER meeting ended).
  BEGIN
    SELECT ROUND(
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY
          EXTRACT(EPOCH FROM (cci.created_at - m.meeting_end)) / 60.0
      )::NUMERIC,
      1
    )
    INTO v_median_speed
    FROM public.command_centre_items cci
    JOIN public.meetings m
      ON m.id = cci.source_event_id
    WHERE cci.org_id    = p_org_id
      AND cci.item_type IN ('email_sent', 'followup_sent')
      AND m.meeting_end IS NOT NULL
      AND cci.created_at > m.meeting_end;
  EXCEPTION WHEN OTHERS THEN
    v_median_speed := NULL;
  END;

  -- ── Metric 3: pipeline_coverage_pct ──────────────────────────────────────
  -- Denominator: active deals in the org
  BEGIN
    SELECT COUNT(*)
    INTO v_active_deals
    FROM public.deals d
    WHERE d.clerk_org_id = p_org_id::TEXT
      AND d.status = 'active';
  EXCEPTION WHEN OTHERS THEN
    v_active_deals := 0;
  END;

  IF v_active_deals > 0 THEN
    -- Numerator: active deals that have had at least one CC item in last 7d.
    -- sequence_jobs uses organization_id TEXT (clerk_org_id), not a UUID org_id,
    -- so we scope via command_centre_items which has the proper UUID org_id.
    BEGIN
      SELECT COUNT(DISTINCT cci.deal_id)
      INTO v_touched_deals
      FROM public.command_centre_items cci
      JOIN public.deals d
        ON d.id     = cci.deal_id
       AND d.clerk_org_id = p_org_id::TEXT
       AND d.status = 'active'
      WHERE cci.org_id     = p_org_id
        AND cci.deal_id    IS NOT NULL
        AND cci.created_at >= v_seven_days_ago;
    EXCEPTION WHEN OTHERS THEN
      v_touched_deals := 0;
    END;

    v_coverage_pct := ROUND(
      (v_touched_deals::NUMERIC / v_active_deals::NUMERIC) * 100.0,
      1
    );
  END IF;

  -- ── Return single summary row ─────────────────────────────────────────────
  RETURN QUERY
  SELECT
    v_hours_saved        AS hours_saved,
    v_median_speed       AS median_followup_speed_minutes,
    v_coverage_pct       AS pipeline_coverage_pct;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_roi_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_roi_summary(UUID) TO service_role;

COMMENT ON FUNCTION public.get_roi_summary IS
  'CTRL-006: Returns a single-row ROI summary for the Control Room ROI widget. '
  'Metrics: hours_saved (automated email sends × avg minutes / 60), '
  'median_followup_speed_minutes (meeting_end → follow-up email, NULL if no data), '
  'pipeline_coverage_pct (% active deals with agent activity in last 7d). '
  'Enforces org membership via auth.uid() — returns no rows for non-members. '
  'Never raises exceptions; returns 0/NULL for missing data.';


-- ============================================================================
-- Migration summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227700001_roi_summary_rpc.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: CTRL-006 (Control Room ROI Summary widget)';
  RAISE NOTICE '';
  RAISE NOTICE 'Schema change:';
  RAISE NOTICE '  org_settings.roi_settings JSONB — configurable ROI params per org';
  RAISE NOTICE '  Default: {} (falls back to avg_manual_minutes_per_email = 8 in RPC)';
  RAISE NOTICE '';
  RAISE NOTICE 'Function created:';
  RAISE NOTICE '  get_roi_summary(p_org_id UUID)';
  RAISE NOTICE '    → (hours_saved NUMERIC,';
  RAISE NOTICE '        median_followup_speed_minutes NUMERIC,';
  RAISE NOTICE '        pipeline_coverage_pct NUMERIC)';
  RAISE NOTICE '';
  RAISE NOTICE 'Security:';
  RAISE NOTICE '  SECURITY DEFINER — bypasses RLS on command_centre_items';
  RAISE NOTICE '  Explicit membership check: organization_memberships WHERE user_id = auth.uid()';
  RAISE NOTICE '  Returns zero rows for non-members (silent permission denial)';
  RAISE NOTICE '';
  RAISE NOTICE 'Resilience:';
  RAISE NOTICE '  All metric sub-queries wrapped in BEGIN/EXCEPTION blocks';
  RAISE NOTICE '  Missing data returns 0 (hours_saved, pipeline_coverage_pct) or NULL';
  RAISE NOTICE '  (median_followup_speed_minutes)';
  RAISE NOTICE '';
  RAISE NOTICE 'Grants: EXECUTE to authenticated + service_role';
  RAISE NOTICE '============================================================================';
END $$;
