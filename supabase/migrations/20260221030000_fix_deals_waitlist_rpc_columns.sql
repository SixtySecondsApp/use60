-- Fix: Remove organization_id from dynamic_table_columns inserts in Deals and Waitlist RPCs
-- The dynamic_table_columns table does NOT have an organization_id column.
-- Org is resolved via table_id -> dynamic_tables.organization_id.
-- This matches the fix applied to provision_standard_ops_tables in 20260218000006.

-- ============================================================================
-- 1. Fix provision_deals_ops_table
-- ============================================================================

CREATE OR REPLACE FUNCTION provision_deals_ops_table(
  p_org_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deals_id UUID;
  v_existing UUID;
  v_columns_count INT;
BEGIN
  -- Check if Deals table already exists for this org (idempotent)
  SELECT id INTO v_existing
  FROM dynamic_tables
  WHERE organization_id = p_org_id
    AND name = 'Deals'
    AND is_standard = true;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'table', 'Deals',
      'id', v_existing,
      'status', 'already_exists'
    );
  END IF;

  -- Create Deals table
  INSERT INTO dynamic_tables (
    id,
    organization_id,
    created_by,
    name,
    source_type,
    is_standard,
    description
  ) VALUES (
    gen_random_uuid(),
    p_org_id,
    p_user_id,
    'Deals',
    'standard',
    true,
    'Pipeline deals with health scores, risk signals, and relationship intelligence'
  ) RETURNING id INTO v_deals_id;

  -- Create 18 system columns for Deals
  -- Note: dynamic_table_columns has NO organization_id column
  INSERT INTO dynamic_table_columns (
    id, table_id, key, label, column_type, position, width,
    hubspot_property_name, attio_property_name, app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    -- 0. Deal Name
    (gen_random_uuid(), v_deals_id, 'deal_name', 'Deal Name', 'text', 0, 250,
     'dealname', NULL, 'deals', 'name',
     NULL, true, true, true),

    -- 1. Company
    (gen_random_uuid(), v_deals_id, 'company_name', 'Company', 'company', 1, 200,
     NULL, NULL, 'deals', 'company',
     NULL, true, true, true),

    -- 2. Deal Value
    (gen_random_uuid(), v_deals_id, 'value', 'Deal Value', 'number', 2, 140,
     'amount', NULL, 'deals', 'value',
     NULL, true, true, true),

    -- 3. Stage
    (gen_random_uuid(), v_deals_id, 'stage', 'Stage', 'status', 3, 160,
     'dealstage', NULL, 'deals', 'stage_id',
     NULL, true, true, true),

    -- 4. Close Date
    (gen_random_uuid(), v_deals_id, 'close_date', 'Close Date', 'date', 4, 160,
     'closedate', NULL, 'deals', 'expected_close_date',
     NULL, true, true, true),

    -- 5. Owner
    (gen_random_uuid(), v_deals_id, 'owner', 'Owner', 'person', 5, 160,
     'hubspot_owner_id', NULL, 'deals', 'owner_id',
     NULL, true, true, true),

    -- 6. Deal Health Score
    (gen_random_uuid(), v_deals_id, 'deal_health_score', 'Health Score', 'number', 6, 120,
     NULL, NULL, 'deal_health_scores', 'overall_health_score',
     NULL, true, true, true),

    -- 7. Health Status
    (gen_random_uuid(), v_deals_id, 'health_status', 'Health Status', 'status', 7, 140,
     NULL, NULL, 'deal_health_scores', 'health_status',
     '[{"value":"healthy","label":"Healthy","color":"#22c55e"},{"value":"warning","label":"Warning","color":"#eab308"},{"value":"critical","label":"Critical","color":"#ef4444"},{"value":"stalled","label":"Stalled","color":"#64748b"}]'::jsonb,
     true, true, true),

    -- 8. Relationship Health Score
    (gen_random_uuid(), v_deals_id, 'relationship_health_score', 'Rel. Health', 'number', 8, 120,
     NULL, NULL, 'relationship_health_scores', 'overall_health_score',
     NULL, true, true, true),

    -- 9. Relationship Health Status
    (gen_random_uuid(), v_deals_id, 'relationship_health_status', 'Rel. Status', 'status', 9, 140,
     NULL, NULL, 'relationship_health_scores', 'health_status',
     '[{"value":"healthy","label":"Healthy","color":"#22c55e"},{"value":"at_risk","label":"At Risk","color":"#eab308"},{"value":"critical","label":"Critical","color":"#ef4444"},{"value":"ghost","label":"Ghost","color":"#64748b"}]'::jsonb,
     true, true, true),

    -- 10. Risk Level
    (gen_random_uuid(), v_deals_id, 'risk_level', 'Risk Level', 'status', 10, 140,
     NULL, NULL, 'deal_health_scores', 'risk_level',
     '[{"value":"low","label":"Low","color":"#22c55e"},{"value":"medium","label":"Medium","color":"#eab308"},{"value":"high","label":"High","color":"#f97316"},{"value":"critical","label":"Critical","color":"#ef4444"}]'::jsonb,
     true, true, true),

    -- 11. Risk Factors
    (gen_random_uuid(), v_deals_id, 'risk_factors', 'Risk Factors', 'tags', 11, 200,
     NULL, NULL, 'deal_health_scores', 'risk_factors',
     NULL, true, true, true),

    -- 12. Days in Stage
    (gen_random_uuid(), v_deals_id, 'days_in_stage', 'Days in Stage', 'number', 12, 100,
     NULL, NULL, NULL, NULL,
     NULL, true, true, true),

    -- 13. Ghost Probability
    (gen_random_uuid(), v_deals_id, 'ghost_probability', 'Ghost Risk %', 'number', 13, 100,
     NULL, NULL, 'relationship_health_scores', 'ghost_probability_percent',
     NULL, true, true, true),

    -- 14. Sentiment Trend
    (gen_random_uuid(), v_deals_id, 'sentiment_trend', 'Sentiment', 'status', 14, 130,
     NULL, NULL, 'deal_health_scores', 'sentiment_trend',
     '[{"value":"improving","label":"Improving","color":"#22c55e"},{"value":"stable","label":"Stable","color":"#64748b"},{"value":"declining","label":"Declining","color":"#ef4444"}]'::jsonb,
     true, true, true),

    -- 15. Last Meeting Date
    (gen_random_uuid(), v_deals_id, 'last_meeting_date', 'Last Meeting', 'date', 15, 140,
     NULL, NULL, NULL, NULL,
     NULL, true, true, true),

    -- 16. Last Activity Date
    (gen_random_uuid(), v_deals_id, 'last_activity_date', 'Last Activity', 'date', 16, 140,
     NULL, NULL, NULL, NULL,
     NULL, true, true, true),

    -- 17. Next Action
    (gen_random_uuid(), v_deals_id, 'next_action', 'Next Action', 'text', 17, 250,
     NULL, NULL, 'next_action_suggestions', 'title',
     NULL, true, true, true);

  GET DIAGNOSTICS v_columns_count = ROW_COUNT;

  -- Create default view: All Deals
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config
  ) VALUES (
    gen_random_uuid(), v_deals_id, p_user_id, 'All Deals', true, true, 0,
    '["deal_name","company_name","value","stage","close_date","owner","deal_health_score","health_status","risk_level","days_in_stage","ghost_probability","sentiment_trend","last_meeting_date","last_activity_date","next_action"]'::jsonb,
    '{"column":"value","direction":"desc"}'::jsonb
  );

  -- Create view: Pipeline Health
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config
  ) VALUES (
    gen_random_uuid(), v_deals_id, p_user_id, 'Pipeline Health', true, false, 1,
    '["deal_name","company_name","value","stage","deal_health_score","health_status","risk_level","days_in_stage","ghost_probability"]'::jsonb,
    '{"column":"deal_health_score","direction":"asc"}'::jsonb
  );

  -- Create view: At Risk
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config, filter_config
  ) VALUES (
    gen_random_uuid(), v_deals_id, p_user_id, 'At Risk', true, false, 2,
    '["deal_name","company_name","value","stage","deal_health_score","health_status","risk_level","risk_factors","days_in_stage","last_meeting_date","next_action"]'::jsonb,
    '{"column":"deal_health_score","direction":"asc"}'::jsonb,
    '[{"column":"health_status","operator":"in","value":["critical","warning"]}]'::jsonb
  );

  -- Create view: High Value
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config
  ) VALUES (
    gen_random_uuid(), v_deals_id, p_user_id, 'High Value', true, false, 3,
    '["deal_name","company_name","value","stage","close_date","owner","deal_health_score"]'::jsonb,
    '{"column":"value","direction":"desc"}'::jsonb
  );

  RETURN jsonb_build_object(
    'table', 'Deals',
    'id', v_deals_id,
    'status', 'created',
    'columns_count', v_columns_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to provision Deals ops table: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_deals_ops_table(UUID, UUID) TO authenticated;

-- ============================================================================
-- 2. Fix provision_waitlist_ops_table
-- ============================================================================

CREATE OR REPLACE FUNCTION provision_waitlist_ops_table(
  p_org_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id UUID;
  v_existing UUID;
  v_columns_count INT;
BEGIN
  -- Check if Waitlist Signups table already exists for this org (idempotent)
  SELECT id INTO v_existing
  FROM dynamic_tables
  WHERE organization_id = p_org_id
    AND name = 'Waitlist Signups'
    AND is_standard = true;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'table', 'Waitlist Signups',
      'id', v_existing,
      'status', 'already_exists'
    );
  END IF;

  -- Create Waitlist Signups table
  INSERT INTO dynamic_tables (
    id,
    organization_id,
    created_by,
    name,
    source_type,
    is_standard,
    description
  ) VALUES (
    gen_random_uuid(),
    p_org_id,
    p_user_id,
    'Waitlist Signups',
    'standard',
    true,
    'Live-syncing waitlist signups with referral tracking, tool preferences, and conversion status'
  ) RETURNING id INTO v_table_id;

  -- Create 19 system columns
  -- Note: dynamic_table_columns has NO organization_id column
  INSERT INTO dynamic_table_columns (
    id, table_id, key, label, column_type, position, width,
    app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    -- 0. Full Name
    (gen_random_uuid(), v_table_id, 'full_name', 'Full Name', 'text', 0, 200,
     'meetings_waitlist', 'full_name',
     NULL, true, true, true),

    -- 1. Email
    (gen_random_uuid(), v_table_id, 'email', 'Email', 'email', 1, 220,
     'meetings_waitlist', 'email',
     NULL, true, true, true),

    -- 2. Company
    (gen_random_uuid(), v_table_id, 'company_name', 'Company', 'company', 2, 200,
     'meetings_waitlist', 'company_name',
     NULL, true, true, true),

    -- 3. Status
    (gen_random_uuid(), v_table_id, 'status', 'Status', 'status', 3, 140,
     'meetings_waitlist', 'status',
     '[{"value":"pending","label":"Pending","color":"#eab308"},{"value":"released","label":"Released","color":"#3b82f6"},{"value":"converted","label":"Converted","color":"#22c55e"},{"value":"rejected","label":"Rejected","color":"#ef4444"}]'::jsonb,
     true, true, true),

    -- 4. Signup Position
    (gen_random_uuid(), v_table_id, 'signup_position', 'Position', 'number', 4, 100,
     'meetings_waitlist', 'signup_position',
     NULL, true, true, true),

    -- 5. Total Points
    (gen_random_uuid(), v_table_id, 'total_points', 'Points', 'number', 5, 100,
     'meetings_waitlist', 'total_points',
     NULL, true, true, true),

    -- 6. Referral Code
    (gen_random_uuid(), v_table_id, 'referral_code', 'Referral Code', 'text', 6, 140,
     'meetings_waitlist', 'referral_code',
     NULL, true, true, true),

    -- 7. Referral Count
    (gen_random_uuid(), v_table_id, 'referral_count', 'Referrals', 'number', 7, 100,
     'meetings_waitlist', 'referral_count',
     NULL, true, true, true),

    -- 8. Referred By
    (gen_random_uuid(), v_table_id, 'referred_by', 'Referred By', 'text', 8, 140,
     'meetings_waitlist', 'referred_by_code',
     NULL, true, true, true),

    -- 9. CRM Tool
    (gen_random_uuid(), v_table_id, 'crm_tool', 'CRM Tool', 'text', 9, 140,
     'meetings_waitlist', 'crm_tool',
     NULL, true, true, true),

    -- 10. Meeting Recorder Tool
    (gen_random_uuid(), v_table_id, 'meeting_recorder_tool', 'Meeting Recorder', 'text', 10, 160,
     'meetings_waitlist', 'meeting_recorder_tool',
     NULL, true, true, true),

    -- 11. Task Manager Tool
    (gen_random_uuid(), v_table_id, 'task_manager_tool', 'Task Manager', 'text', 11, 140,
     'meetings_waitlist', 'task_manager_tool',
     NULL, true, true, true),

    -- 12. Signup Source
    (gen_random_uuid(), v_table_id, 'signup_source', 'Signup Source', 'text', 12, 140,
     'meetings_waitlist', 'signup_source',
     NULL, true, true, true),

    -- 13. UTM Source
    (gen_random_uuid(), v_table_id, 'utm_source', 'UTM Source', 'text', 13, 140,
     'meetings_waitlist', 'utm_source',
     NULL, true, true, true),

    -- 14. UTM Campaign
    (gen_random_uuid(), v_table_id, 'utm_campaign', 'UTM Campaign', 'text', 14, 140,
     'meetings_waitlist', 'utm_campaign',
     NULL, true, true, true),

    -- 15. Registration URL
    (gen_random_uuid(), v_table_id, 'registration_url', 'Registration URL', 'url', 15, 200,
     'meetings_waitlist', 'registration_url',
     NULL, true, true, true),

    -- 16. Access Granted At
    (gen_random_uuid(), v_table_id, 'granted_access_at', 'Access Granted', 'date', 16, 160,
     'meetings_waitlist', 'granted_access_at',
     NULL, true, true, true),

    -- 17. Converted At
    (gen_random_uuid(), v_table_id, 'converted_at', 'Converted At', 'date', 17, 160,
     'meetings_waitlist', 'converted_at',
     NULL, true, true, true),

    -- 18. Created At (signup date)
    (gen_random_uuid(), v_table_id, 'created_at', 'Signed Up', 'date', 18, 160,
     'meetings_waitlist', 'created_at',
     NULL, true, true, true);

  GET DIAGNOSTICS v_columns_count = ROW_COUNT;

  -- Create default view: All Signups
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'All Signups', true, true, 0,
    '["full_name","email","company_name","status","signup_position","total_points","referral_count","crm_tool","signup_source","created_at"]'::jsonb,
    '{"column":"created_at","direction":"desc"}'::jsonb
  );

  -- Create view: Pending Review
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config, filter_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'Pending Review', true, false, 1,
    '["full_name","email","company_name","signup_position","total_points","referral_count","crm_tool","meeting_recorder_tool","created_at"]'::jsonb,
    '{"column":"signup_position","direction":"asc"}'::jsonb,
    '[{"column":"status","operator":"equals","value":"pending"}]'::jsonb
  );

  -- Create view: Converted
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config, filter_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'Converted', true, false, 2,
    '["full_name","email","company_name","referral_count","total_points","granted_access_at","converted_at"]'::jsonb,
    '{"column":"converted_at","direction":"desc"}'::jsonb,
    '[{"column":"status","operator":"equals","value":"converted"}]'::jsonb
  );

  -- Create view: Top Referrers
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config, filter_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'Top Referrers', true, false, 3,
    '["full_name","email","company_name","referral_code","referral_count","total_points","status"]'::jsonb,
    '{"column":"referral_count","direction":"desc"}'::jsonb,
    '[{"column":"referral_count","operator":"greater_than_or_equal","value":1}]'::jsonb
  );

  RETURN jsonb_build_object(
    'table', 'Waitlist Signups',
    'id', v_table_id,
    'status', 'created',
    'columns_count', v_columns_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to provision Waitlist Signups ops table: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_waitlist_ops_table(UUID, UUID) TO authenticated;
