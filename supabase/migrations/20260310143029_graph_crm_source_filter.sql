-- Migration: graph_crm_source_filter
-- Date: 20260310143029
--
-- What this migration does:
--   Updates get_contact_graph_data RPC to:
--   1. Add 'source' field to each contact ('app'/'manual'/'fathom_sync'/'hubspot'/'attio')
--   2. Accept optional p_sources parameter to include CRM index contacts
--   3. UNION crm_contact_index data (deduplicated by email) when CRM sources selected
--   4. Cap CRM contacts to those with active deals OR recent CRM activity (90 days)
--
-- Rollback strategy:
--   Re-run the previous get_contact_graph_data from 20260309141653_add_contact_category.sql
--   Then: DROP FUNCTION IF EXISTS public.get_contact_graph_data(UUID, TEXT, TEXT[]);

BEGIN;

CREATE OR REPLACE FUNCTION public.get_contact_graph_data(
  p_user_id  UUID,
  p_org_id   TEXT,
  p_sources  TEXT[] DEFAULT ARRAY['app']
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
  v_include_app BOOLEAN;
  v_include_hubspot BOOLEAN;
  v_include_attio BOOLEAN;
BEGIN
  v_org_uuid := p_org_id::UUID;
  v_include_app := 'app' = ANY(p_sources);
  v_include_hubspot := 'hubspot' = ANY(p_sources);
  v_include_attio := 'attio' = ANY(p_sources);

  WITH combined AS (
    -- App contacts (existing behaviour)
    SELECT
      c.id,
      c.first_name,
      c.last_name,
      c.full_name,
      c.email,
      c.title,
      c.company,
      c.company_id,
      c.owner_id,
      c.category,
      COALESCE(c.source, 'manual') AS source,

      ws.warmth_score,
      ws.warmth_delta,
      ws.tier,
      ws.recency_score,
      ws.engagement_score,
      ws.deal_momentum_score,
      ws.multi_thread_score,
      ws.sentiment_score,
      ws.last_interaction_at,
      ws.trending_direction,

      co.id   AS company_obj_id,
      co.name AS company_obj_name,
      co.industry AS company_obj_industry,
      co.domain AS company_obj_domain,

      c.id AS join_contact_id
    FROM public.contacts c
    INNER JOIN public.organization_memberships om
      ON om.user_id = c.owner_id
     AND om.org_id  = v_org_uuid
    LEFT JOIN public.contact_warmth_scores ws
      ON ws.contact_id = c.id
     AND ws.user_id    = p_user_id
    LEFT JOIN public.companies co
      ON co.id = c.company_id
    WHERE v_include_app

    UNION ALL

    -- CRM index contacts (HubSpot/Attio) not already in contacts table
    SELECT
      ci.id,
      ci.first_name,
      ci.last_name,
      ci.full_name,
      ci.email,
      ci.job_title AS title,
      ci.company_name AS company,
      NULL::UUID AS company_id,
      NULL::UUID AS owner_id,
      'prospect'::TEXT AS category,
      ci.crm_source AS source,

      NULL::NUMERIC AS warmth_score,
      NULL::NUMERIC AS warmth_delta,
      NULL::TEXT AS tier,
      NULL::NUMERIC AS recency_score,
      NULL::NUMERIC AS engagement_score,
      NULL::NUMERIC AS deal_momentum_score,
      NULL::NUMERIC AS multi_thread_score,
      NULL::NUMERIC AS sentiment_score,
      NULL::TIMESTAMPTZ AS last_interaction_at,
      NULL::TEXT AS trending_direction,

      NULL::UUID AS company_obj_id,
      NULL::TEXT AS company_obj_name,
      NULL::TEXT AS company_obj_industry,
      NULL::TEXT AS company_obj_domain,

      ci.id AS join_contact_id
    FROM public.crm_contact_index ci
    WHERE ci.org_id = v_org_uuid
      AND ci.is_materialized = false
      AND (
        (v_include_hubspot AND ci.crm_source = 'hubspot')
        OR (v_include_attio AND ci.crm_source = 'attio')
      )
      -- Only include CRM contacts with relevance signals
      AND (
        ci.has_active_deal = true
        OR ci.crm_updated_at >= NOW() - INTERVAL '90 days'
        OR ci.lifecycle_stage IN ('opportunity', 'customer', 'evangelist')
      )
      -- Deduplicate: skip CRM contacts whose email already exists in app contacts
      AND NOT EXISTS (
        SELECT 1
        FROM public.contacts ec
        INNER JOIN public.organization_memberships om2
          ON om2.user_id = ec.owner_id
         AND om2.org_id  = v_org_uuid
        WHERE ec.email IS NOT NULL
          AND ci.email IS NOT NULL
          AND LOWER(ec.email) = LOWER(ci.email)
      )
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',                   cb.id,
          'first_name',           cb.first_name,
          'last_name',            cb.last_name,
          'full_name',            cb.full_name,
          'email',                cb.email,
          'title',                cb.title,
          'company',              cb.company,
          'company_id',           cb.company_id,
          'owner_id',             cb.owner_id,
          'category',             cb.category,
          'source',               cb.source,

          'warmth_score',             cb.warmth_score,
          'warmth_delta',             cb.warmth_delta,
          'tier',                     cb.tier,
          'recency_score',            cb.recency_score,
          'engagement_score',         cb.engagement_score,
          'deal_momentum_score',      cb.deal_momentum_score,
          'multi_thread_score',       cb.multi_thread_score,
          'sentiment_score',          cb.sentiment_score,
          'last_interaction_at',      cb.last_interaction_at,
          'trending_direction',       cb.trending_direction,

          'company_obj',  CASE
                            WHEN cb.company_obj_id IS NOT NULL THEN jsonb_build_object(
                              'id',       cb.company_obj_id,
                              'name',     cb.company_obj_name,
                              'industry', cb.company_obj_industry,
                              'domain',   cb.company_obj_domain
                            )
                            ELSE NULL
                          END,

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
              LEFT JOIN public.deal_health_scores dhs
                ON dhs.deal_id = d.id
              WHERE dc.contact_id = cb.join_contact_id
            ),
            '[]'::jsonb
          )
        )
      ),
      '[]'::jsonb
    )
  INTO v_result
  FROM combined cb;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_graph_data(UUID, TEXT, TEXT[])
  TO authenticated, service_role;

-- Drop old 2-arg signature to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_contact_graph_data(UUID, TEXT);

NOTIFY pgrst, 'reload schema';

COMMIT;
