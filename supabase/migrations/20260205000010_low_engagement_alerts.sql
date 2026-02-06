-- Migration: Low Engagement Alert System
-- Story: ORG-NOTIF-010
-- Description: Alert owners when organization members show low engagement

-- ========================================
-- FUNCTION: Check Member Engagement
-- ========================================

CREATE OR REPLACE FUNCTION check_member_engagement(p_user_id UUID, p_org_id UUID, p_days INT DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_activity_count INT := 0;
  v_engagement_data JSONB;
BEGIN
  v_start_date := NOW() - (p_days || ' days')::INTERVAL;

  -- Count activities across different tables
  WITH activity_summary AS (
    -- Deals created/updated
    SELECT COUNT(*) as deals_activity
    FROM deals
    WHERE owner_id = p_user_id
      AND (created_at >= v_start_date OR updated_at >= v_start_date)

    UNION ALL

    -- Tasks created/completed
    SELECT COUNT(*) as tasks_activity
    FROM tasks
    WHERE owner_id = p_user_id
      AND (created_at >= v_start_date OR completed_at >= v_start_date)

    UNION ALL

    -- Meetings attended
    SELECT COUNT(*) as meetings_activity
    FROM meetings
    WHERE owner_user_id = p_user_id
      AND created_at >= v_start_date

    UNION ALL

    -- Activities logged
    SELECT COUNT(*) as activities_logged
    FROM activities
    WHERE user_id = p_user_id
      AND created_at >= v_start_date
  )
  SELECT COALESCE(SUM(deals_activity), 0) INTO v_activity_count
  FROM activity_summary;

  -- Build engagement data
  v_engagement_data := jsonb_build_object(
    'user_id', p_user_id,
    'org_id', p_org_id,
    'period_days', p_days,
    'total_activities', v_activity_count,
    'is_low_engagement', (v_activity_count < 3),
    'checked_at', NOW()
  );

  RETURN v_engagement_data;
END;
$$;

-- ========================================
-- FUNCTION: Send Low Engagement Alerts
-- ========================================

CREATE OR REPLACE FUNCTION send_low_engagement_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_engagement JSONB;
  v_user_name TEXT;
  v_org_name TEXT;
  v_alert_count INT := 0;
BEGIN
  -- Check all active members across all orgs
  FOR v_member IN
    SELECT DISTINCT
      om.user_id,
      om.org_id,
      o.name as org_name,
      p.full_name as user_name
    FROM organization_memberships om
    JOIN organizations o ON o.id = om.org_id
    JOIN profiles p ON p.id = om.user_id
    WHERE om.member_status = 'active'
      AND om.role IN ('member', 'readonly')  -- Only check non-admins
      AND o.is_active = TRUE
  LOOP
    -- Check engagement
    v_engagement := check_member_engagement(v_member.user_id, v_member.org_id, 7);

    -- If low engagement, alert org owners
    IF (v_engagement->>'is_low_engagement')::BOOLEAN THEN
      PERFORM notify_org_members(
        p_org_id := v_member.org_id,
        p_role_filter := ARRAY['owner'],
        p_title := 'Low Member Engagement Alert',
        p_message := format(
          '%s has shown low engagement (%s activities in the last 7 days). Consider checking in.',
          v_member.user_name,
          v_engagement->>'total_activities'
        ),
        p_type := 'warning',
        p_category := 'team',
        p_action_url := '/team',
        p_metadata := v_engagement,
        p_is_org_wide := TRUE
      );

      v_alert_count := v_alert_count + 1;
    END IF;
  END LOOP;

  RETURN v_alert_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON FUNCTION check_member_engagement IS
'Checks a member''s engagement level by counting activities in the last N days. Returns engagement data including whether they are below threshold.';

COMMENT ON FUNCTION send_low_engagement_alerts IS
'Sends alerts to org owners for members with low engagement (<3 activities in 7 days). Returns count of alerts sent. Should be called via cron job weekly.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Low engagement alert functions created:';
  RAISE NOTICE '  ✓ check_member_engagement(user_id, org_id, days) - Check single member';
  RAISE NOTICE '  ✓ send_low_engagement_alerts() - Send alerts for all low-engagement members';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron job to call send_low_engagement_alerts() weekly';
  RAISE NOTICE 'Example: SELECT cron.schedule(''engagement-check'', ''0 10 * * 1'', $job$SELECT send_low_engagement_alerts()$job$);';
  RAISE NOTICE '';
  RAISE NOTICE 'Low engagement threshold: <3 activities in 7 days';
END $$;
