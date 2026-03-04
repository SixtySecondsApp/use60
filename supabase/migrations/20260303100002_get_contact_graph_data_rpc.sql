-- Migration: RG-002 — get_contact_graph_data() RPC
-- Purpose: Returns all contacts for an org enriched with warmth scores,
--          company info, and deal data — used by the relationship graph UI.
-- Date: 2026-03-03

BEGIN;

-- ============================================================================
-- get_contact_graph_data(p_user_id, p_org_id)
--
-- Returns a JSONB array of all contacts (with and without deals) for the given
-- org (identified by clerk_org_id). Each element includes:
--   • contact core fields
--   • warmth sub-scores (nullable — contact may have no score yet)
--   • company object (nullable — contact may have no company_id)
--   • deals array (may be empty)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_graph_data(
  p_user_id UUID,
  p_org_id  TEXT          -- clerk_org_id (text, not uuid)
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
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          -- ---- Contact core ----
          'id',                   c.id,
          'first_name',           c.first_name,
          'last_name',            c.last_name,
          'full_name',            c.full_name,
          'email',                c.email,
          'title',                c.title,
          'company',              c.company,
          'company_id',           c.company_id,
          'owner_id',             c.owner_id,

          -- ---- Warmth scores (null when no score row exists yet) ----
          'warmth_score',             ws.warmth_score,
          'warmth_delta',             ws.warmth_delta,
          'tier',                     ws.tier,
          'recency_score',            ws.recency_score,
          'engagement_score',         ws.engagement_score,
          'deal_momentum_score',      ws.deal_momentum_score,
          'multi_thread_score',       ws.multi_thread_score,
          'sentiment_score',          ws.sentiment_score,
          'last_interaction_at',      ws.last_interaction_at,
          'trending_direction',       ws.trending_direction,

          -- ---- Company object (null when contact has no company_id) ----
          'company_obj',  CASE
                            WHEN co.id IS NOT NULL THEN jsonb_build_object(
                              'id',       co.id,
                              'name',     co.name,
                              'industry', co.industry,
                              'domain',   co.domain
                            )
                            ELSE NULL
                          END,

          -- ---- Deals array (empty array when contact has no deals) ----
          'deals', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id',           d.id,
                  'name',         d.name,
                  'value',        d.value,
                  'stage_id',     d.stage_id,
                  'probability',  d.probability,
                  'status',       d.status,
                  'health_status',  dhs.health_status,
                  'health_score',   dhs.overall_health_score,
                  'role',           dc.role
                )
              )
              FROM public.deal_contacts dc
              JOIN public.deals d
                ON d.id = dc.deal_id
               AND d.clerk_org_id = p_org_id
              LEFT JOIN public.deal_health_scores dhs
                ON dhs.deal_id = d.id
              WHERE dc.contact_id = c.id
            ),
            '[]'::jsonb
          )
        )
      ),
      '[]'::jsonb
    )
  INTO v_result
  FROM public.contacts c
  -- Warmth score (LEFT JOIN — may not exist yet)
  LEFT JOIN public.contact_warmth_scores ws
    ON ws.contact_id = c.id
   AND ws.user_id    = p_user_id
  -- Company (LEFT JOIN — contact.company_id may be null)
  LEFT JOIN public.companies co
    ON co.id = c.company_id
  WHERE c.clerk_org_id = p_org_id;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_contact_graph_data(UUID, TEXT)
  TO authenticated, service_role;

-- ============================================================================
-- Done
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
