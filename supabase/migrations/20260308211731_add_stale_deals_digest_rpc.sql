-- Migration: add_stale_deals_digest_rpc
-- Date: 20260308211731
--
-- What this migration does:
--   Creates get_stale_deals_for_digest RPC that returns stale deals grouped by owner_id.
--   Used by the weekly pipeline hygiene digest edge function.
--
-- Rollback strategy:
--   DROP FUNCTION IF EXISTS get_stale_deals_for_digest(TEXT);

CREATE OR REPLACE FUNCTION public.get_stale_deals_for_digest(
  p_org_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_object_agg(owner_id, deals_arr),
    '{}'::jsonb
  ) INTO v_result
  FROM (
    SELECT
      d.owner_id::text as owner_id,
      jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'name', d.name,
          'company', d.company,
          'value', d.value,
          'stage_name', ds.name,
          'days_since_last_activity', COALESCE(dhs.days_since_last_activity, 999),
          'expected_close_date', d.expected_close_date,
          'ghost_probability', COALESCE(rhs.ghost_probability_percent, 0),
          'stale_reason', CASE
            WHEN COALESCE(dhs.days_since_last_activity, 999) >= 14
              THEN 'no_activity_14d'
            WHEN d.expected_close_date < NOW()
              THEN 'past_close_date'
            WHEN COALESCE(rhs.ghost_probability_percent, 0) >= 70
              THEN 'ghost_risk'
            ELSE 'no_activity_14d'
          END
        )
        ORDER BY COALESCE(d.value, 0) DESC
      ) as deals_arr
    FROM deals d
    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
    LEFT JOIN deal_health_scores dhs ON dhs.deal_id = d.id
    LEFT JOIN LATERAL (
      SELECT r.ghost_probability_percent
      FROM relationship_health_scores r
      WHERE (r.contact_id = d.primary_contact_id OR r.company_id = d.company_id)
      ORDER BY
        CASE WHEN r.contact_id = d.primary_contact_id THEN 0 ELSE 1 END
      LIMIT 1
    ) rhs ON true
    WHERE d.clerk_org_id = p_org_id
      AND d.status = 'active'
      AND d.owner_id IS NOT NULL
      AND (
        COALESCE(dhs.days_since_last_activity, 999) >= 14
        OR d.expected_close_date < NOW()
        OR COALESCE(rhs.ghost_probability_percent, 0) >= 70
      )
    GROUP BY d.owner_id
  ) grouped;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_stale_deals_for_digest IS
  'Returns stale deals grouped by owner_id for the weekly pipeline hygiene digest. Includes deals with no activity 14+ days, past close date, or high ghost probability.';

GRANT EXECUTE ON FUNCTION public.get_stale_deals_for_digest TO service_role;
