-- Migration: Add 30-day grace period to low engagement alerts for new orgs
-- Story: NOTIF-008
-- Description: New organizations created less than 30 days ago should not
--   trigger low engagement alerts. This prevents spamming new customers who
--   just signed up with engagement warnings before they've had time to ramp up.
-- Modifies: send_low_engagement_alerts() (originally in 20260205000010)

-- ========================================
-- FUNCTION: Send Low Engagement Alerts (with grace period)
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
      AND o.created_at < NOW() - INTERVAL '30 days'  -- Skip new orgs (grace period)
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
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'NOTIF-008: 30-day grace period added to send_low_engagement_alerts()';
  RAISE NOTICE '  Organizations created < 30 days ago will no longer trigger alerts';
END $$;
