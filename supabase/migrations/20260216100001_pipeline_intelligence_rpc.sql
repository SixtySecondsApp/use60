-- =============================================================================
-- Migration: Pipeline Intelligence RPC
-- PIPE-001: Single RPC for pipeline view with health scores and relationships
-- =============================================================================

-- Returns deals with health scores, relationship health, next actions, and splits
-- in a single round trip for optimal frontend performance.

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
  -- Extract filter values from JSONB
  -- Note: when the key is missing, the WHERE clause prevents jsonb_array_elements_text
  -- from executing, producing an EMPTY array (not NULL). Use cardinality() = 0 for checks.
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

              -- Stage information
              'stage_name', ds.name,
              'stage_color', ds.color,
              'stage_order', ds.order_position,

              -- Deal health scores
              'health_score', dhs.overall_health_score,
              'health_status', dhs.health_status,
              'risk_level', dhs.risk_level,
              'risk_factors', dhs.risk_factors,
              'sentiment_trend', dhs.sentiment_trend,
              'days_in_current_stage', dhs.days_in_current_stage,
              'days_since_last_meeting', dhs.days_since_last_meeting,
              'predicted_close_probability', dhs.predicted_close_probability,

              -- Relationship health (join on contact OR company)
              'relationship_health_score', rhs.overall_health_score,
              'relationship_health_status', rhs.health_status,
              'ghost_probability', rhs.ghost_probability_percent,
              'relationship_risk_factors', rhs.risk_factors,

              -- Next action counts
              'pending_actions_count', COALESCE(na.pending_count, 0),
              'high_urgency_actions_count', COALESCE(na.high_urgency_count, 0),

              -- Split users
              'split_users', COALESCE(splits.users, '[]'::jsonb)
            ) as deal_obj
          FROM deals d
          LEFT JOIN deal_stages ds ON ds.id = d.stage_id
          LEFT JOIN deal_health_scores dhs ON dhs.deal_id = d.id
          -- Relationship health: pick best match per deal (prefer contact over company), LIMIT 1 prevents duplicates
          LEFT JOIN LATERAL (
            SELECT r.overall_health_score, r.health_status, r.ghost_probability_percent, r.risk_factors
            FROM relationship_health_scores r
            WHERE r.user_id = p_user_id
              AND (r.contact_id = d.primary_contact_id OR r.company_id = d.company_id)
            ORDER BY
              CASE WHEN r.contact_id = d.primary_contact_id THEN 0 ELSE 1 END
            LIMIT 1
          ) rhs ON true
          -- Next actions aggregation
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
              COUNT(*) FILTER (WHERE status = 'pending' AND urgency = 'high') as high_urgency_count
            FROM next_action_suggestions
            WHERE deal_id = d.id
          ) na ON true
          -- Split users aggregation
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

    -- Stage metrics (include all stages, even empty ones)
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
            COALESCE(SUM(d.value * COALESCE(d.probability, ds.default_probability, 0) / 100.0), 0) as weighted_value
          FROM deal_stages ds
          LEFT JOIN deals d ON d.stage_id = ds.id AND d.clerk_org_id = p_org_id AND d.status = v_status
          GROUP BY ds.id, ds.name, ds.color, ds.order_position
        ) sm
      ),
      '[]'::jsonb
    ),

    -- Total count
    'total_count', v_total_count,

    -- Summary statistics (single pass for efficiency)
    'summary', (
      SELECT jsonb_build_object(
        'total_value', COALESCE(SUM(d.value), 0),
        'weighted_value', COALESCE(SUM(d.value * COALESCE(d.probability, 50) / 100.0), 0),
        'deal_count', v_total_count,
        'healthy_count', COUNT(*) FILTER (WHERE dhs.health_status = 'healthy'),
        'warning_count', COUNT(*) FILTER (WHERE dhs.health_status = 'warning'),
        'critical_count', COUNT(*) FILTER (WHERE dhs.health_status = 'critical'),
        'stalled_count', COUNT(*) FILTER (WHERE dhs.health_status = 'stalled')
      )
      FROM deals d
      LEFT JOIN deal_health_scores dhs ON dhs.deal_id = d.id
      WHERE d.clerk_org_id = p_org_id
        AND d.status = v_status
        AND (cardinality(v_stage_ids) = 0 OR d.stage_id = ANY(v_stage_ids))
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- Indexes for Performance
-- =============================================================================

-- Composite index for the main query path
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_query
  ON deals(clerk_org_id, status, stage_id, owner_id)
  WHERE status = 'active';

-- Indexes for search operations (separate for ILIKE optimization)
CREATE INDEX IF NOT EXISTS idx_deals_name_trgm
  ON deals USING gin(name extensions.gin_trgm_ops)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_deals_company_trgm
  ON deals USING gin(company extensions.gin_trgm_ops)
  WHERE status = 'active';

-- Index for deal health lookups
CREATE INDEX IF NOT EXISTS idx_deal_health_scores_deal_id
  ON deal_health_scores(deal_id)
  INCLUDE (overall_health_score, health_status, risk_level, days_in_current_stage);

-- Index for relationship health lookups
CREATE INDEX IF NOT EXISTS idx_relationship_health_contact_company
  ON relationship_health_scores(contact_id, company_id, user_id)
  INCLUDE (overall_health_score, health_status, ghost_probability_percent);

-- Index for next action aggregations
CREATE INDEX IF NOT EXISTS idx_next_actions_deal_status_urgency
  ON next_action_suggestions(deal_id, status, urgency);

-- =============================================================================
-- Permissions
-- =============================================================================

COMMENT ON FUNCTION public.get_pipeline_with_health IS
  'Returns complete pipeline data with health scores, relationships, and actions in a single query. Optimized for <100ms with 200 deals.';

GRANT EXECUTE ON FUNCTION public.get_pipeline_with_health TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pipeline_with_health TO service_role;
