-- ============================================================================
-- FORE-006 + FORE-007: Forecast Category Column + Forecast Aggregation RPC
-- PRD-116: Forecast Dashboard
-- ============================================================================

-- 1. Add forecast_category column to deals table (FORE-006)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS forecast_category TEXT
  CHECK (forecast_category IN ('commit', 'best_case', 'pipeline', 'omitted'));

-- 2. Create index for fast category queries
CREATE INDEX IF NOT EXISTS idx_deals_forecast_category
  ON deals (clerk_org_id, forecast_category)
  WHERE status NOT IN ('won', 'lost') AND forecast_category IS NOT NULL;

-- 3. Forecast aggregation RPC with period filtering (FORE-007)
--    Returns: commit_total, best_case_total, pipeline_total, period
--    Period: 'month' = current calendar month, 'quarter' = current calendar quarter
CREATE OR REPLACE FUNCTION get_forecast_totals(
  p_org_id    uuid,
  p_user_id   uuid,
  p_period    text DEFAULT 'quarter'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_period_start  date;
  v_period_end    date;
  v_result        json;
BEGIN
  -- Determine period boundaries
  IF p_period = 'month' THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end   := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
  ELSE -- quarter (default)
    v_period_start := date_trunc('quarter', CURRENT_DATE)::date;
    v_period_end   := (date_trunc('quarter', CURRENT_DATE) + interval '3 months - 1 day')::date;
  END IF;

  SELECT json_build_object(
    'commit_total',    COALESCE(SUM(CASE WHEN forecast_category = 'commit'    THEN COALESCE(value, 0) ELSE 0 END), 0),
    'best_case_total', COALESCE(SUM(CASE WHEN forecast_category = 'best_case' THEN COALESCE(value, 0) ELSE 0 END), 0),
    'pipeline_total',  COALESCE(SUM(CASE WHEN forecast_category IS NULL
                                          OR forecast_category = 'pipeline'   THEN COALESCE(value, 0) ELSE 0 END), 0),
    'period',          p_period
  )
  INTO v_result
  FROM deals
  WHERE clerk_org_id = p_org_id::text
    AND status NOT IN ('won', 'lost')
    AND forecast_category IS DISTINCT FROM 'omitted'
    AND (
      -- Deals with a close_date in the selected period
      close_date BETWEEN v_period_start AND v_period_end
      -- OR no close date set (include in pipeline view)
      OR close_date IS NULL
    );

  RETURN v_result;
END;
$$;

-- 4. Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_forecast_totals(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION get_forecast_totals IS
  'Returns forecast category totals (commit, best_case, pipeline) for a given org and period. FORE-007.';
