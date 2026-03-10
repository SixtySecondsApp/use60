-- Migration: fix_contact_graph_org_scoping
-- Date: 20260308224435
--
-- What this migration does:
--   Fix get_contact_graph_data RPC to scope contacts via organization_memberships
--   instead of contacts.clerk_org_id (which is NULL for most contacts).
--
-- Rollback strategy:
--   Re-run the original 20260303100002_get_contact_graph_data_rpc.sql migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_contact_graph_data(
  p_user_id UUID,
  p_org_id  TEXT          -- organization UUID passed as text
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_org_uuid UUID;
BEGIN
  -- Cast org_id to UUID for membership lookup
  v_org_uuid := p_org_id::UUID;

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
  -- Scope contacts: owner must be a member of this org
  INNER JOIN public.organization_memberships om
    ON om.user_id = c.owner_id
   AND om.org_id  = v_org_uuid
  -- Warmth score (LEFT JOIN — may not exist yet)
  LEFT JOIN public.contact_warmth_scores ws
    ON ws.contact_id = c.id
   AND ws.user_id    = p_user_id
  -- Company (LEFT JOIN — contact.company_id may be null)
  LEFT JOIN public.companies co
    ON co.id = c.company_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_graph_data(UUID, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
