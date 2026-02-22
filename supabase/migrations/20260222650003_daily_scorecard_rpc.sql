-- ============================================================================
-- Migration: Daily Scorecard Aggregator RPC
-- Purpose: Provide get_daily_scorecard() for the EOD synthesis agent.
--          Aggregates today's CRM activity into a structured JSONB scorecard
--          covering meetings, emails, tasks, deals, and pipeline movement.
-- Story: EOD-003
-- Date: 2026-02-22
-- DEPENDS ON: EOD-001 (user_time_preferences table)
-- ============================================================================

-- ============================================================================
-- FUNCTION: get_daily_scorecard
--
-- Returns a JSONB scorecard for a given user and date covering:
--   meetings_completed    — confirmed meetings with ≥2 attendees that ended
--   meetings_no_show      — calendar events with status 'no_show'
--   emails_sent           — outbound emails logged in activities
--   crm_updates_count     — CRM field update activities logged
--   tasks_completed       — tasks set to 'done' / 'completed' on that date
--   deals_created_count   — new deals created by the user on that date
--   deals_created_value   — total value of deals created
--   pipeline_value_change — difference vs yesterday's pipeline snapshot
--
-- Timezone-aware: date boundaries are computed using the user's timezone
-- from user_time_preferences (falls back to 'America/Chicago').
--
-- Key column names (per CLAUDE.md):
--   meetings     → owner_user_id
--   deals        → owner_id
--   calendar_events → user_id
--   activities   → user_id
--   tasks        → assigned_to / created_by
-- ============================================================================

CREATE OR REPLACE FUNCTION get_daily_scorecard(
  p_user_id  UUID,
  p_org_id   UUID,
  p_date     DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_timezone             TEXT;
  v_day_start            TIMESTAMPTZ;
  v_day_end              TIMESTAMPTZ;
  v_yesterday            DATE;

  -- Scorecard accumulators
  v_meetings_completed   INT := 0;
  v_meetings_no_show     INT := 0;
  v_emails_sent          INT := 0;
  v_crm_updates          INT := 0;
  v_tasks_completed      INT := 0;
  v_deals_created_count  INT := 0;
  v_deals_created_value  NUMERIC(18, 2) := 0;
  v_pipeline_today       NUMERIC(18, 2) := 0;
  v_pipeline_yesterday   NUMERIC(18, 2) := 0;
  v_pipeline_delta       NUMERIC(18, 2) := 0;

BEGIN
  -- ------------------------------------------------------------------
  -- 1. Resolve user timezone from user_time_preferences
  -- ------------------------------------------------------------------
  SELECT COALESCE(utp.timezone, 'America/Chicago')
  INTO v_timezone
  FROM user_time_preferences utp
  WHERE utp.user_id = p_user_id
    AND utp.org_id  = p_org_id
  LIMIT 1;

  IF v_timezone IS NULL THEN
    v_timezone := 'America/Chicago';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Convert the requested date into UTC boundaries using user timezone
  -- ------------------------------------------------------------------
  v_day_start := (p_date::TEXT || ' 00:00:00')::TIMESTAMPTZ AT TIME ZONE v_timezone;
  v_day_end   := (p_date::TEXT || ' 23:59:59.999999')::TIMESTAMPTZ AT TIME ZONE v_timezone;
  v_yesterday := p_date - INTERVAL '1 day';

  -- ------------------------------------------------------------------
  -- 3. Meetings completed today (calendar_events with ≥2 attendees that ended)
  -- ------------------------------------------------------------------
  SELECT COUNT(*)
  INTO v_meetings_completed
  FROM calendar_events ce
  WHERE ce.user_id       = p_user_id
    AND ce.attendees_count > 1
    AND ce.end_time      >= v_day_start
    AND ce.end_time      <= v_day_end
    AND LOWER(COALESCE(ce.status, 'confirmed')) NOT IN ('cancelled', 'no_show', 'tentative');

  -- ------------------------------------------------------------------
  -- 4. No-shows (calendar_events with no_show status)
  -- ------------------------------------------------------------------
  SELECT COUNT(*)
  INTO v_meetings_no_show
  FROM calendar_events ce
  WHERE ce.user_id       = p_user_id
    AND ce.start_time   >= v_day_start
    AND ce.start_time   <= v_day_end
    AND LOWER(COALESCE(ce.status, '')) = 'no_show';

  -- ------------------------------------------------------------------
  -- 5. Emails sent today (activities with type = 'email' or 'email_sent')
  -- ------------------------------------------------------------------
  SELECT COUNT(*)
  INTO v_emails_sent
  FROM activities a
  WHERE a.user_id     = p_user_id
    AND a.created_at >= v_day_start
    AND a.created_at <= v_day_end
    AND a.type IN ('email', 'email_sent', 'outbound_email');

  -- ------------------------------------------------------------------
  -- 6. CRM updates logged today
  -- ------------------------------------------------------------------
  SELECT COUNT(*)
  INTO v_crm_updates
  FROM activities a
  WHERE a.user_id     = p_user_id
    AND a.created_at >= v_day_start
    AND a.created_at <= v_day_end
    AND a.type IN ('crm_update', 'note', 'field_update');

  -- ------------------------------------------------------------------
  -- 7. Tasks completed today
  --    Tasks has both assigned_to and created_by — check either
  -- ------------------------------------------------------------------
  SELECT COUNT(*)
  INTO v_tasks_completed
  FROM tasks t
  WHERE (t.assigned_to = p_user_id OR t.created_by = p_user_id)
    AND t.updated_at >= v_day_start
    AND t.updated_at <= v_day_end
    AND LOWER(t.status) IN ('done', 'completed', 'closed');

  -- ------------------------------------------------------------------
  -- 8. Deals created today (deals.owner_id — NOT user_id per CLAUDE.md)
  -- ------------------------------------------------------------------
  SELECT
    COUNT(*),
    COALESCE(SUM(d.value), 0)
  INTO
    v_deals_created_count,
    v_deals_created_value
  FROM deals d
  WHERE d.owner_id   = p_user_id
    AND d.org_id     = p_org_id
    AND d.created_at >= v_day_start
    AND d.created_at <= v_day_end;

  -- ------------------------------------------------------------------
  -- 9. Pipeline value change: today vs yesterday snapshot
  -- ------------------------------------------------------------------

  -- Today's live pipeline (open deals)
  SELECT COALESCE(SUM(d.value), 0)
  INTO v_pipeline_today
  FROM deals d
  WHERE d.owner_id = p_user_id
    AND d.org_id   = p_org_id
    AND d.status NOT IN ('won', 'lost');

  -- Yesterday's snapshot from pipeline_snapshots (if available)
  SELECT COALESCE(ps.total_pipeline_value, 0)
  INTO v_pipeline_yesterday
  FROM pipeline_snapshots ps
  WHERE ps.user_id      = p_user_id
    AND ps.org_id       = p_org_id
    AND ps.snapshot_date = v_yesterday
  LIMIT 1;

  v_pipeline_delta := v_pipeline_today - COALESCE(v_pipeline_yesterday, 0);

  -- ------------------------------------------------------------------
  -- 10. Assemble and return scorecard JSONB
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'date',                  p_date,
    'timezone',              v_timezone,
    'meetings_completed',    v_meetings_completed,
    'meetings_no_show',      v_meetings_no_show,
    'emails_sent',           v_emails_sent,
    'crm_updates_count',     v_crm_updates,
    'tasks_completed',       v_tasks_completed,
    'deals_created_count',   v_deals_created_count,
    'deals_created_value',   v_deals_created_value,
    'pipeline_value_today',  v_pipeline_today,
    'pipeline_value_change', v_pipeline_delta,
    'computed_at',           now()
  );

END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_scorecard(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_scorecard(UUID, UUID, DATE) TO service_role;

COMMENT ON FUNCTION get_daily_scorecard IS
  'Returns a JSONB scorecard for a user/org/date with meetings_completed, meetings_no_show, emails_sent, crm_updates_count, tasks_completed, deals_created (count + value), and pipeline_value_change vs prior snapshot. Timezone-aware — uses user_time_preferences.timezone (falls back to America/Chicago). Deals use owner_id, meetings use owner_user_id, calendar_events use user_id per schema conventions.';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600003_daily_scorecard_rpc.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: EOD-003';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - get_daily_scorecard(user_id, org_id, date) → JSONB';
  RAISE NOTICE '    Returns scorecard JSONB with:';
  RAISE NOTICE '      date, timezone, meetings_completed, meetings_no_show,';
  RAISE NOTICE '      emails_sent, crm_updates_count, tasks_completed,';
  RAISE NOTICE '      deals_created_count, deals_created_value,';
  RAISE NOTICE '      pipeline_value_today, pipeline_value_change, computed_at';
  RAISE NOTICE '';
  RAISE NOTICE '  Timezone-aware: resolves user timezone from user_time_preferences.';
  RAISE NOTICE '  Column name conventions (per CLAUDE.md):';
  RAISE NOTICE '    calendar_events.user_id, activities.user_id,';
  RAISE NOTICE '    deals.owner_id, tasks.assigned_to/created_by';
  RAISE NOTICE '';
  RAISE NOTICE 'Grants: EXECUTE to authenticated + service_role';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
