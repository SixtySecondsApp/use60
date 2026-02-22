-- ============================================================================
-- CTI-009: Forecast Calibration RPC (PRD-21)
-- Phase 6: Coaching & Team Intelligence — Pipeline Forecast Accuracy
-- ============================================================================

-- 1. Add metadata column to pipeline_snapshots for calibration data
ALTER TABLE pipeline_snapshots
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2. Get rep's calibration profile from most recent pipeline snapshot
CREATE OR REPLACE FUNCTION get_rep_calibration(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(metadata->'rep_calibration', '{}'::jsonb)
  FROM pipeline_snapshots
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND metadata->'rep_calibration' IS NOT NULL
  ORDER BY snapshot_date DESC
  LIMIT 1;
$$;

-- 3. Get team forecast accuracy for manager view
CREATE OR REPLACE FUNCTION get_team_forecast_accuracy(
  p_org_id uuid,
  p_weeks integer DEFAULT 4
)
RETURNS TABLE (
  user_id uuid,
  avg_forecast_accuracy numeric,
  weeks_tracked integer,
  latest_calibration jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH recent_snapshots AS (
    SELECT
      ps.user_id,
      ps.forecast_accuracy_trailing,
      ps.metadata,
      ps.snapshot_date,
      ROW_NUMBER() OVER (PARTITION BY ps.user_id ORDER BY ps.snapshot_date DESC) as rn
    FROM pipeline_snapshots ps
    WHERE ps.org_id = p_org_id
      AND ps.forecast_accuracy_trailing IS NOT NULL
    ORDER BY ps.snapshot_date DESC
  ),
  user_stats AS (
    SELECT
      rs.user_id,
      AVG(rs.forecast_accuracy_trailing) as avg_forecast_accuracy,
      COUNT(*)::integer as weeks_tracked,
      (SELECT rs2.metadata->'rep_calibration' FROM recent_snapshots rs2 WHERE rs2.user_id = rs.user_id AND rs2.rn = 1) as latest_calibration
    FROM recent_snapshots rs
    WHERE rs.rn <= p_weeks
    GROUP BY rs.user_id
  )
  SELECT
    us.user_id,
    ROUND(us.avg_forecast_accuracy, 4) as avg_forecast_accuracy,
    us.weeks_tracked,
    COALESCE(us.latest_calibration, '{}'::jsonb) as latest_calibration
  FROM user_stats us
  ORDER BY us.avg_forecast_accuracy DESC;
$$;
