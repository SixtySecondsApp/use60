-- Migration: Add get_enrichment_stats RPC
-- Replaces the N+1 query pattern in OpsPage that fetches all rows then all cells
-- in 500-chunk loops. Single query does server-side aggregation instead.

CREATE OR REPLACE FUNCTION get_enrichment_stats(p_org_id UUID)
RETURNS TABLE(
  table_id UUID,
  enriched BIGINT,
  pending BIGINT,
  failed BIGINT
) AS $$
  SELECT
    r.table_id,
    COUNT(*) FILTER (WHERE c.status = 'complete' AND c.confidence IS NOT NULL) AS enriched,
    COUNT(*) FILTER (WHERE c.status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE c.status = 'failed') AS failed
  FROM dynamic_table_rows r
  JOIN dynamic_table_cells c ON c.row_id = r.id
  WHERE r.table_id IN (
    SELECT dt.id FROM dynamic_tables dt WHERE dt.organization_id = p_org_id
  )
  AND c.status IN ('complete', 'pending', 'failed')
  GROUP BY r.table_id;
$$ LANGUAGE sql STABLE;

-- Grant access to authenticated users (RLS on dynamic_tables ensures org isolation)
GRANT EXECUTE ON FUNCTION get_enrichment_stats(UUID) TO authenticated;
