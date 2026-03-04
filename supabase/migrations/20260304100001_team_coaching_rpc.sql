-- COACH-UI-007: RPC for team coaching stats aggregation
-- Returns per-rep: avg score, grade distribution, trend, total scorecards
-- Supports period filtering: '7d', '30d', '90d', '365d'

CREATE OR REPLACE FUNCTION get_team_coaching_stats(
  p_org_id UUID,
  p_period TEXT DEFAULT '30d'
)
RETURNS TABLE (
  user_id UUID,
  scorecard_count BIGINT,
  avg_score NUMERIC,
  grade_a BIGINT,
  grade_b BIGINT,
  grade_c BIGINT,
  grade_d BIGINT,
  grade_f BIGINT,
  trend_direction NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_half_date TIMESTAMPTZ;
BEGIN
  -- Verify caller belongs to the org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = p_org_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  -- Compute date range
  v_start_date := CASE p_period
    WHEN '7d'   THEN NOW() - INTERVAL '7 days'
    WHEN '30d'  THEN NOW() - INTERVAL '30 days'
    WHEN '90d'  THEN NOW() - INTERVAL '90 days'
    WHEN '365d' THEN NOW() - INTERVAL '365 days'
    ELSE              NOW() - INTERVAL '30 days'
  END;

  v_half_date := v_start_date + (NOW() - v_start_date) / 2;

  RETURN QUERY
  WITH org_members AS (
    SELECT om.user_id
    FROM organization_memberships om
    WHERE om.org_id = p_org_id
  ),
  scorecards AS (
    SELECT
      ms.rep_user_id,
      ms.overall_score,
      ms.grade,
      ms.created_at
    FROM meeting_scorecards ms
    WHERE ms.rep_user_id IN (SELECT om.user_id FROM org_members om)
      AND ms.created_at >= v_start_date
  ),
  first_half AS (
    SELECT
      s.rep_user_id,
      AVG(s.overall_score) AS half_avg
    FROM scorecards s
    WHERE s.created_at < v_half_date
    GROUP BY s.rep_user_id
  ),
  second_half AS (
    SELECT
      s.rep_user_id,
      AVG(s.overall_score) AS half_avg
    FROM scorecards s
    WHERE s.created_at >= v_half_date
    GROUP BY s.rep_user_id
  )
  SELECT
    s.rep_user_id AS user_id,
    COUNT(*)::BIGINT AS scorecard_count,
    ROUND(AVG(s.overall_score), 1) AS avg_score,
    COUNT(*) FILTER (WHERE s.grade = 'A')::BIGINT AS grade_a,
    COUNT(*) FILTER (WHERE s.grade = 'B')::BIGINT AS grade_b,
    COUNT(*) FILTER (WHERE s.grade = 'C')::BIGINT AS grade_c,
    COUNT(*) FILTER (WHERE s.grade = 'D')::BIGINT AS grade_d,
    COUNT(*) FILTER (WHERE s.grade = 'F')::BIGINT AS grade_f,
    COALESCE(sh.half_avg, 0) - COALESCE(fh.half_avg, COALESCE(sh.half_avg, 0)) AS trend_direction
  FROM scorecards s
  LEFT JOIN first_half fh ON fh.rep_user_id = s.rep_user_id
  LEFT JOIN second_half sh ON sh.rep_user_id = s.rep_user_id
  GROUP BY s.rep_user_id, fh.half_avg, sh.half_avg;
END;
$$;

GRANT EXECUTE ON FUNCTION get_team_coaching_stats(UUID, TEXT) TO authenticated;

-- Ensure get_active_org_insights RPC exists (from coaching backend)
-- It may already exist, but create it if not
CREATE OR REPLACE FUNCTION get_active_org_insights(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  insight_type TEXT,
  title TEXT,
  insight_text TEXT,
  evidence_count INTEGER,
  confidence_score NUMERIC,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller belongs to the org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = p_org_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    oi.id,
    oi.org_id,
    oi.insight_type,
    oi.title,
    oi.insight_text,
    oi.evidence_count,
    oi.confidence_score,
    oi.expires_at,
    oi.created_at,
    oi.updated_at
  FROM org_learning_insights oi
  WHERE oi.org_id = p_org_id
    AND (oi.expires_at IS NULL OR oi.expires_at > NOW())
  ORDER BY oi.confidence_score DESC, oi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_org_insights(UUID) TO authenticated;
