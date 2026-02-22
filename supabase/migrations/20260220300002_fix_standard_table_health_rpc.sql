-- =============================================================================
-- Migration: Fix get_standard_table_health RPC
-- Fix: dynamic_table_rows has created_at, not updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_standard_table_health(
  p_org_id UUID
)
RETURNS TABLE(
  table_id UUID,
  table_name TEXT,
  row_count BIGINT,
  last_synced_at TIMESTAMPTZ,
  source_breakdown JSONB,
  conflict_count_7d BIGINT,
  stale_rows BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dt.id AS table_id,
    dt.name AS table_name,
    dt.row_count::BIGINT AS row_count,
    -- Most recent row creation across all rows
    (
      SELECT MAX(r.created_at)
      FROM public.dynamic_table_rows r
      WHERE r.table_id = dt.id
    ) AS last_synced_at,
    -- Breakdown by source_type
    (
      SELECT COALESCE(jsonb_object_agg(sub.source_type, sub.cnt), '{}'::jsonb)
      FROM (
        SELECT r.source_type, COUNT(*)::BIGINT AS cnt
        FROM public.dynamic_table_rows r
        WHERE r.table_id = dt.id
        GROUP BY r.source_type
      ) sub
    ) AS source_breakdown,
    -- Conflicts in last 7 days
    (
      SELECT COUNT(*)::BIGINT
      FROM public.ops_sync_conflicts c
      WHERE c.table_id = dt.id
        AND c.created_at >= NOW() - INTERVAL '7 days'
    ) AS conflict_count_7d,
    -- Rows not created in >24h (stale)
    (
      SELECT COUNT(*)::BIGINT
      FROM public.dynamic_table_rows r
      WHERE r.table_id = dt.id
        AND r.source_type IN ('hubspot', 'attio')
        AND r.created_at < NOW() - INTERVAL '24 hours'
    ) AS stale_rows
  FROM public.dynamic_tables dt
  WHERE dt.organization_id = p_org_id
    AND dt.is_standard = true
  ORDER BY dt.name;
END;
$$;
