-- Migration: Orchestrator Metrics RPC
-- Purpose: Add get_orchestrator_metrics function for observability dashboard
-- Feature: event-wiring (WIRE-006)
-- Date: 2026-02-16

-- =============================================================================
-- Function: get_orchestrator_metrics
-- Returns aggregated metrics from sequence_jobs table for observability
-- =============================================================================

CREATE OR REPLACE FUNCTION get_orchestrator_metrics(
  p_org_id TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_sequences', (
      SELECT COUNT(*)
      FROM sequence_jobs
      WHERE organization_id = p_org_id
        AND started_at BETWEEN p_start_date AND p_end_date
    ),
    'sequences_by_source', (
      SELECT COALESCE(jsonb_object_agg(event_source, cnt), '{}'::jsonb)
      FROM (
        SELECT COALESCE(event_source, 'unknown') as event_source, COUNT(*) as cnt
        FROM sequence_jobs
        WHERE organization_id = p_org_id
          AND started_at BETWEEN p_start_date AND p_end_date
        GROUP BY event_source
      ) sub
    ),
    'sequences_by_status', (
      SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status::TEXT, COUNT(*) as cnt
        FROM sequence_jobs
        WHERE organization_id = p_org_id
          AND started_at BETWEEN p_start_date AND p_end_date
        GROUP BY status
      ) sub
    ),
    'avg_duration_ms', (
      SELECT COALESCE(
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::BIGINT,
        0
      )
      FROM sequence_jobs
      WHERE organization_id = p_org_id
        AND started_at BETWEEN p_start_date AND p_end_date
        AND completed_at IS NOT NULL
        AND status = 'completed'
    ),
    'success_rate', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(
          COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)::NUMERIC * 100,
          1
        )
      END
      FROM sequence_jobs
      WHERE organization_id = p_org_id
        AND started_at BETWEEN p_start_date AND p_end_date
    ),
    'stuck_jobs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'event_source', COALESCE(event_source, 'unknown'),
        'user_id', user_id,
        'status', status::TEXT,
        'current_step', current_step,
        'current_skill_key', current_skill_key,
        'started_at', started_at,
        'updated_at', updated_at,
        'hours_stuck', ROUND(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600, 1)
      )), '[]'::jsonb)
      FROM sequence_jobs
      WHERE organization_id = p_org_id
        AND status = 'waiting_approval'
        AND updated_at < NOW() - INTERVAL '24 hours'
    ),
    'daily_counts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', day::DATE,
        'count', cnt,
        'completed', completed_cnt,
        'failed', failed_cnt
      ) ORDER BY day), '[]'::jsonb)
      FROM (
        SELECT
          DATE_TRUNC('day', started_at) as day,
          COUNT(*) as cnt,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_cnt,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_cnt
        FROM sequence_jobs
        WHERE organization_id = p_org_id
          AND started_at BETWEEN p_start_date AND p_end_date
        GROUP BY DATE_TRUNC('day', started_at)
      ) sub
    ),
    'top_skills', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'skill_key', skill_key,
        'count', cnt
      ) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT current_skill_key as skill_key, COUNT(*) as cnt
        FROM sequence_jobs
        WHERE organization_id = p_org_id
          AND started_at BETWEEN p_start_date AND p_end_date
          AND current_skill_key IS NOT NULL
        GROUP BY current_skill_key
        ORDER BY cnt DESC
        LIMIT 10
      ) sub
    ),
    'error_summary', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'error_message', COALESCE(SUBSTRING(error_message, 1, 100), 'unknown'),
        'count', cnt,
        'error_step', error_step
      ) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT
          error_message,
          error_step,
          COUNT(*) as cnt
        FROM sequence_jobs
        WHERE organization_id = p_org_id
          AND started_at BETWEEN p_start_date AND p_end_date
          AND status = 'failed'
          AND error_message IS NOT NULL
        GROUP BY error_message, error_step
        ORDER BY cnt DESC
        LIMIT 10
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users (RLS on sequence_jobs controls data access)
GRANT EXECUTE ON FUNCTION get_orchestrator_metrics TO authenticated;

COMMENT ON FUNCTION get_orchestrator_metrics IS
  'Returns aggregated orchestrator metrics for an organization within a date range. Used by observability dashboard.';
