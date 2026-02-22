-- ============================================================================
-- Migration: Pipeline Math RPC Functions
-- Purpose: Compute pipeline math (coverage, weighted value, gap analysis)
--          for use by the morning briefing agent. Results are cached into
--          pipeline_snapshots for the current date (15-minute effective TTL
--          via the unique-on-date constraint).
-- Story: BRF-003
-- Date: 2026-02-22
-- DEPENDS ON: BRF-001 (pipeline_snapshots), agent_config_defaults (BRF-002)
-- ============================================================================

-- ============================================================================
-- FUNCTION: get_weighted_pipeline
-- Returns weighted pipeline value for a user based on stage close probabilities.
-- Stage probability comes from deal_stages.default_probability (0-100 int).
-- Falls back to the deal's own probability column if stage not found.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_weighted_pipeline(
  p_user_id UUID,
  p_org_id  UUID
)
RETURNS NUMERIC(18, 2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    SUM(
      d.value * COALESCE(ds.default_probability, d.probability, 50) / 100.0
    ),
    0
  )
  FROM deals d
  LEFT JOIN deal_stages ds ON ds.id = d.stage_id
  WHERE d.owner_id = p_user_id
    AND d.clerk_org_id = p_org_id::TEXT
    AND d.status NOT IN ('won', 'lost');
$$;

GRANT EXECUTE ON FUNCTION get_weighted_pipeline(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_weighted_pipeline(UUID, UUID) TO service_role;

COMMENT ON FUNCTION get_weighted_pipeline IS 'Returns weighted pipeline value for a user by multiplying each deal value by its stage close probability (deal_stages.default_probability). Active deals only (status != won|lost).';

-- ============================================================================
-- FUNCTION: calculate_pipeline_math
-- Full pipeline math computation with gap analysis.
-- Returns a composite record. Cached into pipeline_snapshots on each call.
--
-- Returns:
--   target                 — from agent_config (quota.revenue), NULL if unset
--   closed_so_far          — sum of closed-won deals this period
--   pct_to_target          — closed_so_far / target (NULL if target unset)
--   total_pipeline         — sum of open deal values
--   weighted_pipeline      — probability-weighted open pipeline
--   coverage_ratio         — weighted_pipeline / (target - closed_so_far)
--                            NULL if target unset or remaining target <= 0
--   gap_amount             — target - closed_so_far (remaining to close)
--                            NULL if target unset
--   projected_close        — trailing_close_rate * weighted_pipeline
--                            trailing_close_rate = (avg weekly closes / avg weekly starts)
--   deals_at_risk          — count of open deals with health_score < 50
--   deals_by_stage         — jsonb {stage_name: {count, total_value}}
--   snapshot_date          — today's date (calendar day of the call)
-- ============================================================================

DROP TYPE IF EXISTS pipeline_math_result CASCADE;
CREATE TYPE pipeline_math_result AS (
  target                 NUMERIC(18, 2),
  closed_so_far          NUMERIC(18, 2),
  pct_to_target          NUMERIC(8, 4),
  total_pipeline         NUMERIC(18, 2),
  weighted_pipeline      NUMERIC(18, 2),
  coverage_ratio         NUMERIC(8, 4),
  gap_amount             NUMERIC(18, 2),
  projected_close        NUMERIC(18, 2),
  deals_at_risk          INT,
  deals_by_stage         JSONB,
  snapshot_date          DATE
);

CREATE OR REPLACE FUNCTION calculate_pipeline_math(
  p_org_id  UUID,
  p_user_id UUID,
  p_period  TEXT DEFAULT 'quarterly'
)
RETURNS pipeline_math_result
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result              pipeline_math_result;
  v_target              NUMERIC(18, 2);
  v_period_start        DATE;
  v_period_end          DATE;
  v_closed_so_far       NUMERIC(18, 2);
  v_total_pipeline      NUMERIC(18, 2);
  v_weighted_pipeline   NUMERIC(18, 2);
  v_deals_at_risk       INT;
  v_deals_by_stage      JSONB;
  v_gap                 NUMERIC(18, 2);
  v_coverage            NUMERIC(8, 4);
  v_pct                 NUMERIC(8, 4);
  v_projected           NUMERIC(18, 2);

  -- Trailing close rate calculation variables
  v_trailing_weeks      INT := 8;
  v_prev_snapshot_date  DATE;
  v_prev_weighted       NUMERIC(18, 2);
  v_prev_closed         NUMERIC(18, 2);
  v_trailing_rate       NUMERIC(8, 4);

  v_quarter_start_month INT;
  v_today               DATE := CURRENT_DATE;

BEGIN
  -- ------------------------------------------------------------------
  -- 1. Resolve quarter_start_month from agent config (default Jan = 1)
  -- ------------------------------------------------------------------
  SELECT COALESCE(
    (resolve_agent_config(p_org_id, p_user_id, 'morning_briefing', 'quarter_start_month'))::int,
    1
  ) INTO v_quarter_start_month;

  -- ------------------------------------------------------------------
  -- 2. Determine period bounds
  -- ------------------------------------------------------------------
  IF p_period = 'quarterly' THEN
    DECLARE
      v_q_start_candidate DATE;
    BEGIN
      -- Find the most recent quarter start (month boundary) before today
      v_q_start_candidate := DATE_TRUNC('year', v_today)
        + (((((EXTRACT(MONTH FROM v_today) - v_quarter_start_month)::INT % 3 + 3) % 3) * -1)
           || ' months')::INTERVAL;
      -- Ensure we land on the right calendar month
      v_period_start := (
        DATE_TRUNC('year', v_today + ((v_quarter_start_month - 1) || ' months')::INTERVAL)
        + (
            (FLOOR(
              (EXTRACT(MONTH FROM v_today) - v_quarter_start_month + 12)::NUMERIC / 3
            ) * 3) || ' months'
          )::INTERVAL
        - ((v_quarter_start_month - 1) || ' months')::INTERVAL
      )::DATE;
      v_period_end := (v_period_start + '3 months'::INTERVAL - '1 day'::INTERVAL)::DATE;
    END;
  ELSIF p_period = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', v_today)::DATE;
    v_period_end   := (v_period_start + '1 month'::INTERVAL - '1 day'::INTERVAL)::DATE;
  ELSE
    -- weekly default
    v_period_start := DATE_TRUNC('week', v_today)::DATE;
    v_period_end   := (v_period_start + '7 days'::INTERVAL - '1 day'::INTERVAL)::DATE;
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Resolve quota target from agent_config (quota.revenue key)
  -- ------------------------------------------------------------------
  SELECT (
    resolve_agent_config(p_org_id, p_user_id, 'morning_briefing', 'quota.revenue')
  )::jsonb->>'value'
  INTO v_target;
  -- v_target is NULL when no quota is set — all downstream calcs handle NULL gracefully

  -- ------------------------------------------------------------------
  -- 4. Closed-won this period
  -- ------------------------------------------------------------------
  SELECT COALESCE(SUM(d.value), 0)
  INTO v_closed_so_far
  FROM deals d
  WHERE d.owner_id = p_user_id
    AND d.clerk_org_id = p_org_id::TEXT
    AND d.status   = 'won'
    AND d.closed_won_date >= v_period_start
    AND d.closed_won_date <= v_period_end;

  -- ------------------------------------------------------------------
  -- 5. Total open pipeline
  -- ------------------------------------------------------------------
  SELECT COALESCE(SUM(d.value), 0)
  INTO v_total_pipeline
  FROM deals d
  WHERE d.owner_id = p_user_id
    AND d.clerk_org_id = p_org_id::TEXT
    AND d.status NOT IN ('won', 'lost');

  -- ------------------------------------------------------------------
  -- 6. Weighted pipeline (via helper function)
  -- ------------------------------------------------------------------
  SELECT get_weighted_pipeline(p_user_id, p_org_id)
  INTO v_weighted_pipeline;

  -- ------------------------------------------------------------------
  -- 7. At-risk deal count (health_score < 50 or NULL for open deals)
  -- ------------------------------------------------------------------
  SELECT COUNT(*)
  INTO v_deals_at_risk
  FROM deals d
  WHERE d.owner_id = p_user_id
    AND d.clerk_org_id = p_org_id::TEXT
    AND d.status NOT IN ('won', 'lost')
    AND (d.health_score IS NULL OR d.health_score < 50);

  -- ------------------------------------------------------------------
  -- 8. Deals by stage breakdown
  -- ------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_object_agg(
      ds.name,
      jsonb_build_object(
        'count',       stage_counts.cnt,
        'total_value', stage_counts.total
      )
    ),
    '{}'::jsonb
  )
  INTO v_deals_by_stage
  FROM (
    SELECT
      d.stage_id,
      COUNT(*)           AS cnt,
      SUM(d.value)       AS total
    FROM deals d
    WHERE d.owner_id = p_user_id
      AND d.clerk_org_id = p_org_id::TEXT
      AND d.status NOT IN ('won', 'lost')
    GROUP BY d.stage_id
  ) stage_counts
  JOIN deal_stages ds ON ds.id = stage_counts.stage_id;

  -- ------------------------------------------------------------------
  -- 9. Gap analysis (only when target is set)
  -- ------------------------------------------------------------------
  IF v_target IS NOT NULL AND v_target > 0 THEN
    v_gap      := GREATEST(v_target - v_closed_so_far, 0);
    v_pct      := ROUND(v_closed_so_far / v_target, 4);
    -- Coverage = weighted pipeline / remaining gap (avoid div-by-zero)
    IF v_gap > 0 THEN
      v_coverage := ROUND(v_weighted_pipeline / v_gap, 4);
    ELSE
      v_coverage := NULL; -- target already met, coverage ratio not meaningful
    END IF;
  ELSE
    v_gap      := NULL;
    v_pct      := NULL;
    v_coverage := NULL;
  END IF;

  -- ------------------------------------------------------------------
  -- 10. Projected close via trailing close rate
  -- Compare prior pipeline snapshot to actual closes over same window.
  -- trailing_rate = avg weekly close rate over v_trailing_weeks
  -- If no prior snapshot: default to 25% of weighted pipeline.
  -- ------------------------------------------------------------------
  SELECT
    ps.snapshot_date,
    ps.weighted_pipeline_value,
    ps.closed_this_period
  INTO
    v_prev_snapshot_date,
    v_prev_weighted,
    v_prev_closed
  FROM pipeline_snapshots ps
  WHERE ps.user_id = p_user_id
    AND ps.org_id  = p_org_id
    AND ps.snapshot_date < v_today
    AND ps.snapshot_date >= (v_today - (v_trailing_weeks * 7))
  ORDER BY ps.snapshot_date DESC
  LIMIT 1;

  IF v_prev_weighted IS NOT NULL AND v_prev_weighted > 0 THEN
    v_trailing_rate := LEAST(ROUND(v_prev_closed / v_prev_weighted, 4), 1.0);
  ELSE
    v_trailing_rate := 0.25; -- conservative default when no history
  END IF;

  v_projected := ROUND(v_trailing_rate * v_weighted_pipeline, 2);

  -- ------------------------------------------------------------------
  -- 11. Assemble result
  -- ------------------------------------------------------------------
  v_result.target            := v_target;
  v_result.closed_so_far     := v_closed_so_far;
  v_result.pct_to_target     := v_pct;
  v_result.total_pipeline    := v_total_pipeline;
  v_result.weighted_pipeline := v_weighted_pipeline;
  v_result.coverage_ratio    := v_coverage;
  v_result.gap_amount        := v_gap;
  v_result.projected_close   := v_projected;
  v_result.deals_at_risk     := v_deals_at_risk;
  v_result.deals_by_stage    := v_deals_by_stage;
  v_result.snapshot_date     := v_today;

  -- ------------------------------------------------------------------
  -- 12. Cache result into pipeline_snapshots (upsert on org+user+date)
  -- ------------------------------------------------------------------
  INSERT INTO pipeline_snapshots (
    org_id,
    user_id,
    snapshot_date,
    period,
    total_pipeline_value,
    weighted_pipeline_value,
    deals_by_stage,
    deals_at_risk,
    closed_this_period,
    target,
    coverage_ratio
  ) VALUES (
    p_org_id,
    p_user_id,
    v_today,
    p_period,
    v_total_pipeline,
    v_weighted_pipeline,
    v_deals_by_stage,
    v_deals_at_risk,
    v_closed_so_far,
    v_target,
    v_coverage
  )
  ON CONFLICT (org_id, user_id, snapshot_date)
  DO UPDATE SET
    period                  = EXCLUDED.period,
    total_pipeline_value    = EXCLUDED.total_pipeline_value,
    weighted_pipeline_value = EXCLUDED.weighted_pipeline_value,
    deals_by_stage          = EXCLUDED.deals_by_stage,
    deals_at_risk           = EXCLUDED.deals_at_risk,
    closed_this_period      = EXCLUDED.closed_this_period,
    target                  = EXCLUDED.target,
    coverage_ratio          = EXCLUDED.coverage_ratio,
    updated_at              = now();

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_pipeline_math(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_pipeline_math(UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION calculate_pipeline_math IS 'Computes full pipeline math for a user/org/period and caches the result in pipeline_snapshots. Returns: target, closed_so_far, pct_to_target, total_pipeline, weighted_pipeline, coverage_ratio, gap_amount, projected_close (trailing rate), deals_at_risk, deals_by_stage. All gap/coverage/pct fields are NULL when quota.revenue is unset.';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222500003_pipeline_math_rpcs.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: BRF-003';
  RAISE NOTICE '';
  RAISE NOTICE 'Composite type created:';
  RAISE NOTICE '  - pipeline_math_result (11 fields)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - get_weighted_pipeline(user_id, org_id) → NUMERIC(18,2)';
  RAISE NOTICE '    Sums deal.value × stage.default_probability for open deals.';
  RAISE NOTICE '';
  RAISE NOTICE '  - calculate_pipeline_math(org_id, user_id, period) → pipeline_math_result';
  RAISE NOTICE '    Computes: target, closed_so_far, pct_to_target, total_pipeline,';
  RAISE NOTICE '              weighted_pipeline, coverage_ratio, gap_amount,';
  RAISE NOTICE '              projected_close (trailing rate), deals_at_risk, deals_by_stage.';
  RAISE NOTICE '    Periods: quarterly (default) | monthly | weekly.';
  RAISE NOTICE '    Quarter start month from agent_config (quarter_start_month key).';
  RAISE NOTICE '    Target from agent_config (quota.revenue key) — NULL-safe.';
  RAISE NOTICE '    Trailing close rate from last snapshot in the window (default 25%%).';
  RAISE NOTICE '    Results upserted into pipeline_snapshots on each call.';
  RAISE NOTICE '';
  RAISE NOTICE 'Grants: EXECUTE to authenticated + service_role';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
