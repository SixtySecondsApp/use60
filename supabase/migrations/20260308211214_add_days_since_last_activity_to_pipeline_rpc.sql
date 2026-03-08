-- Migration: add_days_since_last_activity_to_pipeline_rpc
-- Date: 20260308211214
--
-- What this migration does:
--   1. Adds days_since_last_activity to get_pipeline_with_health RPC deal output
--   2. Excludes dormant deals (30+ days no activity) from weighted_value in stage metrics and summary
--   3. Adds dormant_count to summary statistics
--   4. Adds composite index on activities(deal_id, created_at) for performance
--
-- Rollback strategy:
--   Re-apply the original 20260216400001_pipeline_intelligence_rpc.sql migration

-- Composite index for efficient last-activity lookups
CREATE INDEX IF NOT EXISTS idx_activities_deal_id_created_at
  ON activities(deal_id, created_at DESC)
  WHERE deal_id IS NOT NULL;

-- Updated RPC with days_since_last_activity + dormant exclusion from forecast
CREATE OR REPLACE FUNCTION public.get_pipeline_with_health(
  p_user_id UUID,
  p_org_id TEXT,
  p_filters JSONB DEFAULT '{}',
  p_sort_by TEXT DEFAULT 'value',
  p_sort_dir TEXT DEFAULT 'desc',
  p_limit INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_stage_ids UUID[];
  v_health_status TEXT[];
  v_risk_level TEXT[];
  v_owner_ids UUID[];
  v_search TEXT;
  v_status TEXT;
  v_sort_asc BOOLEAN;
  v_total_count INTEGER;
BEGIN
  v_stage_ids := ARRAY(
    SELECT jsonb_array_elements_text(p_filters->'stage_ids')::UUID
    WHERE p_filters ? 'stage_ids'
  );

  v_health_status := ARRAY(
    SELECT jsonb_array_elements_text(p_filters->'health_status')
    WHERE p_filters ? 'health_status'
  );

  v_risk_level := ARRAY(
    SELECT jsonb_array_elements_text(p_filters->'risk_level')
    WHERE p_filters ? 'risk_level'
  );

  v_owner_ids := ARRAY(
    SELECT jsonb_array_elements_text(p_filters->'owner_ids')::UUID
    WHERE p_filters ? 'owner_ids'
  );

  v_search := p_filters->>'search';
  v_status := COALESCE(p_filters->>'status', 'active');
  v_sort_asc := LOWER(p_sort_dir) = 'asc';

  -- Get total count (before pagination)
  SELECT COUNT(*)::INTEGER INTO v_total_count
  FROM deals d
  LEFT JOIN deal_health_scores dhs ON dhs.deal_id = d.id
  WHERE d.clerk_org_id = p_org_id
    AND d.status = v_status
    AND (cardinality(v_stage_ids) = 0 OR d.stage_id = ANY(v_stage_ids))
    AND (cardinality(v_health_status) = 0 OR dhs.health_status = ANY(v_health_status))
    AND (cardinality(v_risk_level) = 0 OR dhs.risk_level = ANY(v_risk_level))
    AND (cardinality(v_owner_ids) = 0 OR d.owner_id = ANY(v_owner_ids))
    AND (v_search IS NULL OR d.name ILIKE '%' || v_search || '%' OR d.company ILIKE '%' || v_search || '%');

  -- Build main result with deals array
  SELECT jsonb_build_object(
    'deals', COALESCE(
      (
        SELECT jsonb_agg(deal_obj ORDER BY idx)
        FROM (
          SELECT
            ROW_NUMBER() OVER () as idx,
            jsonb_build_object(
              -- Core deal fields
              'id', d.id,
              'name', d.name,
              'company', d.company,
              'value', d.value,
              'stage_id', d.stage_id,
              'owner_id', d.owner_id,
              'close_date', d.close_date,
              'expected_close_date', d.expected_close_date,
              'probability', d.probability,
              'status', d.status,
              'created_at', d.created_at,
              'stage_changed_at', d.stage_changed_at,
              'company_id', d.company_id,
              'primary_contact_id', d.primary_contact_id,
              'contact_name', d.contact_name,
              'contact_email', d.contact_email,

              -- Stage information
              'stage_name', ds.name,
              'stage_color', ds.color,
              'stage_order', ds.order_position,

              -- Deal health scores (nulled for Signed/Lost stages)
              'health_score', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.overall_health_score END,
              'health_status', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.health_status END,
              'risk_level', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.risk_level END,
              'risk_factors', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.risk_factors END,
              'sentiment_trend', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.sentiment_trend END,
              'days_in_current_stage', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.days_in_current_stage END,
              'days_since_last_meeting', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.days_since_last_meeting END,
              'days_since_last_activity', CASE
                WHEN COALESCE(ds.default_probability, 50) = 100 THEN 0          -- Signed/won → never dormant
                WHEN COALESCE(ds.default_probability, 50) = 0   THEN 999        -- Lost → always dormant
                ELSE COALESCE(dhs.days_since_last_activity, EXTRACT(DAY FROM NOW() - d.created_at)::INTEGER)
              END,
              'predicted_close_probability', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE dhs.predicted_close_probability END,

              -- Relationship health (nulled for Signed/Lost stages)
              'relationship_health_score', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE rhs.overall_health_score END,
              'relationship_health_status', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE rhs.health_status END,
              'ghost_probability', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE rhs.ghost_probability_percent END,
              'relationship_risk_factors', CASE WHEN COALESCE(ds.default_probability, 50) IN (0, 100) THEN NULL ELSE rhs.risk_factors END,

              -- Next action counts
              'pending_actions_count', COALESCE(na.pending_count, 0),
              'high_urgency_actions_count', COALESCE(na.high_urgency_count, 0),

              -- Split users
              'split_users', COALESCE(splits.users, '[]'::jsonb)
            ) as deal_obj
          FROM deals d
          LEFT JOIN deal_stages ds ON ds.id = d.stage_id
          LEFT JOIN deal_health_scores dhs ON dhs.deal_id = d.id
          LEFT JOIN LATERAL (
            SELECT r.overall_health_score, r.health_status, r.ghost_probability_percent, r.risk_factors
            FROM relationship_health_scores r
            WHERE r.user_id = p_user_id
              AND (r.contact_id = d.primary_contact_id OR r.company_id = d.company_id)
            ORDER BY
              CASE WHEN r.contact_id = d.primary_contact_id THEN 0 ELSE 1 END
            LIMIT 1
          ) rhs ON true
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
              COUNT(*) FILTER (WHERE status = 'pending' AND urgency = 'high') as high_urgency_count
            FROM next_action_suggestions
            WHERE deal_id = d.id
          ) na ON true
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(
              jsonb_build_object(
                'user_id', dsw.user_id,
                'full_name', dsw.full_name,
                'percentage', dsw.percentage,
                'amount', dsw.amount
              )
            ) as users
            FROM deal_splits_with_users dsw
            WHERE dsw.deal_id = d.id
          ) splits ON true
          WHERE d.clerk_org_id = p_org_id
            AND d.status = v_status
            AND (cardinality(v_stage_ids) = 0 OR d.stage_id = ANY(v_stage_ids))
            AND (cardinality(v_health_status) = 0 OR dhs.health_status = ANY(v_health_status))
            AND (cardinality(v_risk_level) = 0 OR dhs.risk_level = ANY(v_risk_level))
            AND (cardinality(v_owner_ids) = 0 OR d.owner_id = ANY(v_owner_ids))
            AND (v_search IS NULL OR d.name ILIKE '%' || v_search || '%' OR d.company ILIKE '%' || v_search || '%')
          ORDER BY
            CASE WHEN p_sort_by = 'value' AND NOT v_sort_asc THEN d.value END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'value' AND v_sort_asc THEN d.value END ASC NULLS LAST,
            CASE WHEN p_sort_by = 'health_score' AND NOT v_sort_asc THEN dhs.overall_health_score END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'health_score' AND v_sort_asc THEN dhs.overall_health_score END ASC NULLS LAST,
            CASE WHEN p_sort_by = 'days_in_stage' AND NOT v_sort_asc THEN dhs.days_in_current_stage END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'days_in_stage' AND v_sort_asc THEN dhs.days_in_current_stage END ASC NULLS LAST,
            CASE WHEN p_sort_by = 'close_date' AND NOT v_sort_asc THEN d.close_date END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'close_date' AND v_sort_asc THEN d.close_date END ASC NULLS LAST,
            CASE WHEN p_sort_by = 'created_at' AND NOT v_sort_asc THEN d.created_at END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'created_at' AND v_sort_asc THEN d.created_at END ASC NULLS LAST,
            CASE WHEN p_sort_by = 'name' AND NOT v_sort_asc THEN d.name END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'name' AND v_sort_asc THEN d.name END ASC NULLS LAST
          LIMIT p_limit
          OFFSET p_offset
        ) deals_query
      ),
      '[]'::jsonb
    ),

    -- Stage metrics — weighted_value excludes dormant deals (30+ days no activity)
    'stage_metrics', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'stage_id', sm.stage_id,
            'stage_name', sm.stage_name,
            'stage_color', sm.stage_color,
            'stage_order', sm.stage_order,
            'deal_count', sm.deal_count,
            'total_value', sm.total_value,
            'weighted_value', sm.weighted_value
          )
          ORDER BY sm.stage_order
        )
        FROM (
          SELECT
            ds.id as stage_id,
            ds.name as stage_name,
            ds.color as stage_color,
            ds.order_position as stage_order,
            COUNT(d.id)::INTEGER as deal_count,
            COALESCE(SUM(d.value), 0) as total_value,
            COALESCE(SUM(
              CASE
                WHEN COALESCE(ds.default_probability, 50) = 0 THEN 0  -- Lost → always dormant, exclude
                WHEN COALESCE(ds.default_probability, 50) = 100 THEN d.value * 1.0  -- Signed → never dormant, full value
                WHEN COALESCE(dhs.days_since_last_activity, EXTRACT(DAY FROM NOW() - d.created_at)::INTEGER) < 30
                     THEN d.value * COALESCE(d.probability, ds.default_probability, 0) / 100.0
                ELSE 0
              END
            ), 0) as weighted_value
          FROM deal_stages ds
          LEFT JOIN deals d ON d.stage_id = ds.id AND d.clerk_org_id = p_org_id AND d.status = v_status
          LEFT JOIN deal_health_scores dhs ON dhs.deal_id = d.id
          GROUP BY ds.id, ds.name, ds.color, ds.order_position
        ) sm
      ),
      '[]'::jsonb
    ),

    -- Total count
    'total_count', v_total_count,

    -- Summary statistics — weighted_value excludes dormant, adds dormant_count
    'summary', (
      SELECT jsonb_build_object(
        'total_value', COALESCE(SUM(d.value), 0),
        'weighted_value', COALESCE(SUM(
          CASE
            WHEN COALESCE(ds2.default_probability, 50) = 0 THEN 0  -- Lost → always dormant, exclude
            WHEN COALESCE(ds2.default_probability, 50) = 100 THEN d.value * 1.0  -- Signed → never dormant, full value
            WHEN COALESCE(dhs.days_since_last_activity, EXTRACT(DAY FROM NOW() - d.created_at)::INTEGER) < 30
                 THEN d.value * COALESCE(d.probability, 50) / 100.0
            ELSE 0
          END
        ), 0),
        'deal_count', v_total_count,
        'healthy_count', COUNT(*) FILTER (WHERE dhs.health_status = 'healthy' AND COALESCE(ds2.default_probability, 50) NOT IN (0, 100)),
        'warning_count', COUNT(*) FILTER (WHERE dhs.health_status = 'warning' AND COALESCE(ds2.default_probability, 50) NOT IN (0, 100)),
        'critical_count', COUNT(*) FILTER (WHERE dhs.health_status = 'critical' AND COALESCE(ds2.default_probability, 50) NOT IN (0, 100)),
        'stalled_count', COUNT(*) FILTER (WHERE dhs.health_status = 'stalled' AND COALESCE(ds2.default_probability, 50) NOT IN (0, 100)),
        'dormant_count', COUNT(*) FILTER (WHERE
          COALESCE(ds2.default_probability, 50) = 0  -- Lost → always dormant
          OR (COALESCE(ds2.default_probability, 50) != 100  -- Signed → never dormant
              AND COALESCE(dhs.days_since_last_activity, EXTRACT(DAY FROM NOW() - d.created_at)::INTEGER) >= 30)
        )
      )
      FROM deals d
      LEFT JOIN deal_stages ds2 ON ds2.id = d.stage_id
      LEFT JOIN deal_health_scores dhs ON dhs.deal_id = d.id
      WHERE d.clerk_org_id = p_org_id
        AND d.status = v_status
        AND (cardinality(v_stage_ids) = 0 OR d.stage_id = ANY(v_stage_ids))
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_pipeline_with_health IS
  'Returns complete pipeline data with health scores, relationships, and actions. Includes days_since_last_activity and excludes dormant deals (30+ days) from weighted forecast values.';

GRANT EXECUTE ON FUNCTION public.get_pipeline_with_health TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pipeline_with_health TO service_role;
