-- Migration: Standard Deals Ops Table
-- Creates a standalone function to provision the Deals ops table with 18 system columns
-- including health scores, risk signals, and relationship intelligence

-- Note: Rows in this table are synced from the deals table via sync_deals_to_ops_table (PIPE-005)
-- and are read-only for end users. RLS policies should allow SELECT but not INSERT/UPDATE/DELETE.

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
  INSERT INTO dynamic_table_columns (
    id, table_id, organization_id, key, label, column_type, position, width,
    hubspot_property_name, attio_property_name, app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    -- 0. Deal Name
    (gen_random_uuid(), v_deals_id, p_org_id, 'deal_name', 'Deal Name', 'text', 0, 250,
     'dealname', NULL, 'deals', 'name',
     NULL, true, true, true),

    -- 1. Company (relationship join via company_id)
    (gen_random_uuid(), v_deals_id, p_org_id, 'company_name', 'Company', 'company', 1, 200,
     NULL, NULL, 'deals', 'company',
     NULL, true, true, true),

    -- 2. Deal Value
    (gen_random_uuid(), v_deals_id, p_org_id, 'value', 'Deal Value', 'number', 2, 140,
     'amount', NULL, 'deals', 'value',
     NULL, true, true, true),

    -- 3. Stage (rendered as stage name)
    (gen_random_uuid(), v_deals_id, p_org_id, 'stage', 'Stage', 'status', 3, 160,
     'dealstage', NULL, 'deals', 'stage_id',
     NULL, true, true, true),

    -- 4. Close Date
    (gen_random_uuid(), v_deals_id, p_org_id, 'close_date', 'Close Date', 'date', 4, 160,
     'closedate', NULL, 'deals', 'expected_close_date',
     NULL, true, true, true),

    -- 5. Owner
    (gen_random_uuid(), v_deals_id, p_org_id, 'owner', 'Owner', 'person', 5, 160,
     'hubspot_owner_id', NULL, 'deals', 'owner_id',
     NULL, true, true, true),

    -- 6. Deal Health Score (computed)
    (gen_random_uuid(), v_deals_id, p_org_id, 'deal_health_score', 'Health Score', 'number', 6, 120,
     NULL, NULL, 'deal_health_scores', 'overall_health_score',
     NULL, true, true, true),

    -- 7. Health Status (computed)
    (gen_random_uuid(), v_deals_id, p_org_id, 'health_status', 'Health Status', 'status', 7, 140,
     NULL, NULL, 'deal_health_scores', 'health_status',
     '[{"value":"healthy","label":"Healthy","color":"#22c55e"},{"value":"warning","label":"Warning","color":"#eab308"},{"value":"critical","label":"Critical","color":"#ef4444"},{"value":"stalled","label":"Stalled","color":"#64748b"}]'::jsonb,
     true, true, true),

    -- 8. Relationship Health Score (computed)
    (gen_random_uuid(), v_deals_id, p_org_id, 'relationship_health_score', 'Rel. Health', 'number', 8, 120,
     NULL, NULL, 'relationship_health_scores', 'overall_health_score',
     NULL, true, true, true),

    -- 9. Relationship Health Status (computed) -- uses relationship_health_scores values: healthy, at_risk, critical, ghost
    (gen_random_uuid(), v_deals_id, p_org_id, 'relationship_health_status', 'Rel. Status', 'status', 9, 140,
     NULL, NULL, 'relationship_health_scores', 'health_status',
     '[{"value":"healthy","label":"Healthy","color":"#22c55e"},{"value":"at_risk","label":"At Risk","color":"#eab308"},{"value":"critical","label":"Critical","color":"#ef4444"},{"value":"ghost","label":"Ghost","color":"#64748b"}]'::jsonb,
     true, true, true),

    -- 10. Risk Level (computed)
    (gen_random_uuid(), v_deals_id, p_org_id, 'risk_level', 'Risk Level', 'status', 10, 140,
     NULL, NULL, 'deal_health_scores', 'risk_level',
     '[{"value":"low","label":"Low","color":"#22c55e"},{"value":"medium","label":"Medium","color":"#eab308"},{"value":"high","label":"High","color":"#f97316"},{"value":"critical","label":"Critical","color":"#ef4444"}]'::jsonb,
     true, true, true),

    -- 11. Risk Factors (computed, text array)
    (gen_random_uuid(), v_deals_id, p_org_id, 'risk_factors', 'Risk Factors', 'tags', 11, 200,
     NULL, NULL, 'deal_health_scores', 'risk_factors',
     NULL, true, true, true),

    -- 12. Days in Stage (computed from stage_changed_at)
    (gen_random_uuid(), v_deals_id, p_org_id, 'days_in_stage', 'Days in Stage', 'number', 12, 100,
     NULL, NULL, NULL, NULL,
     NULL, true, true, true),

    -- 13. Ghost Probability (computed)
    (gen_random_uuid(), v_deals_id, p_org_id, 'ghost_probability', 'Ghost Risk %', 'number', 13, 100,
     NULL, NULL, 'relationship_health_scores', 'ghost_probability_percent',
     NULL, true, true, true),

    -- 14. Sentiment Trend (computed)
    (gen_random_uuid(), v_deals_id, p_org_id, 'sentiment_trend', 'Sentiment', 'status', 14, 130,
     NULL, NULL, 'deal_health_scores', 'sentiment_trend',
     '[{"value":"improving","label":"Improving","color":"#22c55e"},{"value":"stable","label":"Stable","color":"#64748b"},{"value":"declining","label":"Declining","color":"#ef4444"}]'::jsonb,
     true, true, true),

    -- 15. Last Meeting Date (computed from meetings)
    (gen_random_uuid(), v_deals_id, p_org_id, 'last_meeting_date', 'Last Meeting', 'date', 15, 140,
     NULL, NULL, NULL, NULL,
     NULL, true, true, true),

    -- 16. Last Activity Date (computed from activities)
    (gen_random_uuid(), v_deals_id, p_org_id, 'last_activity_date', 'Last Activity', 'date', 16, 140,
     NULL, NULL, NULL, NULL,
     NULL, true, true, true),

    -- 17. Next Action (most recent pending suggestion)
    (gen_random_uuid(), v_deals_id, p_org_id, 'next_action', 'Next Action', 'text', 17, 250,
     NULL, NULL, 'next_action_suggestions', 'title',
     NULL, true, true, true);

  GET DIAGNOSTICS v_columns_count = ROW_COUNT;

  -- Create default view: All Deals
  -- Note: dynamic_table_views has no organization_id column; position is required (NOT NULL DEFAULT 0)
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION provision_deals_ops_table(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION provision_deals_ops_table IS
  'Provisions the Deals standard ops table with 18 system columns including health scores, risk signals, and relationship intelligence. Idempotent - returns early if already provisioned. Rows are synced from deals table via sync_deals_to_ops_table.';
