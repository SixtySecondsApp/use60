-- Migration: Weekly Activity Digest System
-- Story: ORG-NOTIF-008
-- Description: Send weekly digest of org activity to owners

-- ========================================
-- FUNCTION: Generate Weekly Digest
-- ========================================

CREATE OR REPLACE FUNCTION generate_weekly_digest(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digest JSONB;
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_new_members INT;
  v_deals_won INT;
  v_deals_lost INT;
  v_total_deal_value NUMERIC;
  v_critical_alerts INT;
  v_top_performers JSONB;
BEGIN
  -- Get date range (last 7 days)
  v_end_date := NOW();
  v_start_date := v_end_date - INTERVAL '7 days';

  -- Count new members
  SELECT COUNT(*) INTO v_new_members
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND created_at >= v_start_date
    AND created_at < v_end_date
    AND member_status = 'active';

  -- Count deals won
  SELECT COUNT(*) INTO v_deals_won
  FROM deals d
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND d.stage = 'closed_won'
    AND d.updated_at >= v_start_date
    AND d.updated_at < v_end_date;

  -- Count deals lost
  SELECT COUNT(*) INTO v_deals_lost
  FROM deals d
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND d.stage = 'closed_lost'
    AND d.updated_at >= v_start_date
    AND d.updated_at < v_end_date;

  -- Sum deal value won
  SELECT COALESCE(SUM(d.value), 0) INTO v_total_deal_value
  FROM deals d
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND d.stage = 'closed_won'
    AND d.updated_at >= v_start_date
    AND d.updated_at < v_end_date;

  -- Count critical alerts
  SELECT COUNT(*) INTO v_critical_alerts
  FROM deal_health_alerts dha
  JOIN deals d ON dha.deal_id = d.id
  JOIN organization_memberships om ON d.owner_id = om.user_id
  WHERE om.org_id = p_org_id
    AND dha.severity = 'critical'
    AND dha.created_at >= v_start_date
    AND dha.created_at < v_end_date;

  -- Get top performers (by deals won)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.id,
        'full_name', p.full_name,
        'deals_won', deal_count,
        'total_value', total_value
      )
    ),
    '[]'::jsonb
  ) INTO v_top_performers
  FROM (
    SELECT
      om.user_id,
      COUNT(d.id) as deal_count,
      SUM(d.value) as total_value
    FROM deals d
    JOIN organization_memberships om ON d.owner_id = om.user_id
    WHERE om.org_id = p_org_id
      AND d.stage = 'closed_won'
      AND d.updated_at >= v_start_date
      AND d.updated_at < v_end_date
    GROUP BY om.user_id
    ORDER BY deal_count DESC, total_value DESC
    LIMIT 3
  ) top_users
  JOIN profiles p ON p.id = top_users.user_id;

  -- Build digest object
  v_digest := jsonb_build_object(
    'period', jsonb_build_object(
      'start', v_start_date,
      'end', v_end_date
    ),
    'metrics', jsonb_build_object(
      'new_members', v_new_members,
      'deals_won', v_deals_won,
      'deals_lost', v_deals_lost,
      'total_revenue', v_total_deal_value,
      'critical_alerts', v_critical_alerts
    ),
    'top_performers', v_top_performers
  );

  RETURN v_digest;
END;
$$;

-- ========================================
-- FUNCTION: Send Weekly Digests
-- ========================================

CREATE OR REPLACE FUNCTION send_weekly_digests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org RECORD;
  v_digest JSONB;
  v_message TEXT;
  v_sent_count INT := 0;
BEGIN
  -- Loop through all organizations
  FOR v_org IN
    SELECT id, name FROM organizations WHERE is_active = TRUE
  LOOP
    -- Generate digest
    v_digest := generate_weekly_digest(v_org.id);

    -- Skip if no activity
    IF (v_digest->'metrics'->>'new_members')::INT = 0
       AND (v_digest->'metrics'->>'deals_won')::INT = 0
       AND (v_digest->'metrics'->>'deals_lost')::INT = 0
       AND (v_digest->'metrics'->>'critical_alerts')::INT = 0 THEN
      CONTINUE;
    END IF;

    -- Build message
    v_message := format(
      'Weekly Summary for %s: %s members joined, %s deals won ($%s), %s critical alerts',
      v_org.name,
      v_digest->'metrics'->>'new_members',
      v_digest->'metrics'->>'deals_won',
      TO_CHAR((v_digest->'metrics'->>'total_revenue')::NUMERIC, 'FM999,999,999'),
      v_digest->'metrics'->>'critical_alerts'
    );

    -- Send to owners only
    PERFORM notify_org_members(
      p_org_id := v_org.id,
      p_role_filter := ARRAY['owner'],
      p_title := 'Weekly Activity Digest',
      p_message := v_message,
      p_type := 'info',
      p_category := 'digest',
      p_action_url := '/dashboard',
      p_metadata := v_digest,
      p_is_org_wide := TRUE
    );

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN v_sent_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON FUNCTION generate_weekly_digest IS
'Generates weekly activity digest for an organization, including metrics and top performers.';

COMMENT ON FUNCTION send_weekly_digests IS
'Sends weekly digest notifications to organization owners. Returns count of digests sent. Should be called via cron job every Monday morning.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Weekly digest functions created:';
  RAISE NOTICE '  ✓ generate_weekly_digest(org_id) - Generate digest data';
  RAISE NOTICE '  ✓ send_weekly_digests() - Send digests to all org owners';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron job to call send_weekly_digests() every Monday at 9am';
  RAISE NOTICE 'Example: SELECT cron.schedule(''weekly-digest'', ''0 9 * * 1'', $job$SELECT send_weekly_digests()$job$);';
END $$;
