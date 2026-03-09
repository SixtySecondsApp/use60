-- Migration: add_contact_category
-- Date: 20260309141653
--
-- What this migration does:
--   Adds a category column to contacts for classifying relationship type
--   (prospect, client, employee, supplier, partner, investor, other).
--   Updates get_contact_graph_data RPC to include category.
--
-- Rollback strategy:
--   ALTER TABLE contacts DROP COLUMN IF EXISTS category;
--   Re-run previous get_contact_graph_data migration.

BEGIN;

-- Add category column with default 'prospect'
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'prospect';

-- Add check constraint for valid categories
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_category_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_category_check
  CHECK (category IN ('prospect', 'client', 'employee', 'supplier', 'partner', 'investor', 'other'));

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_category ON public.contacts (category);

-- Update RPC to include category
CREATE OR REPLACE FUNCTION public.get_contact_graph_data(
  p_user_id UUID,
  p_org_id  TEXT
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
  v_org_uuid := p_org_id::UUID;

  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',                   c.id,
          'first_name',           c.first_name,
          'last_name',            c.last_name,
          'full_name',            c.full_name,
          'email',                c.email,
          'title',                c.title,
          'company',              c.company,
          'company_id',           c.company_id,
          'owner_id',             c.owner_id,
          'category',             c.category,

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

          'company_obj',  CASE
                            WHEN co.id IS NOT NULL THEN jsonb_build_object(
                              'id',       co.id,
                              'name',     co.name,
                              'industry', co.industry,
                              'domain',   co.domain
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
  INNER JOIN public.organization_memberships om
    ON om.user_id = c.owner_id
   AND om.org_id  = v_org_uuid
  LEFT JOIN public.contact_warmth_scores ws
    ON ws.contact_id = c.id
   AND ws.user_id    = p_user_id
  LEFT JOIN public.companies co
    ON co.id = c.company_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_graph_data(UUID, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
