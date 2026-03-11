-- Migration: linkedin_attribution_events
-- Date: 20260310130000
--
-- What this migration does:
--   Creates linkedin_attribution_events table to track cross-feature attribution
--   chains: ad library insight → campaign created → lead captured → contact →
--   deal → revenue. Enables the Overview Dashboard attribution card (LI-022).
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.linkedin_attribution_events;

CREATE TABLE IF NOT EXISTS public.linkedin_attribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  event_type text NOT NULL,
  -- event_type values:
  --   'ad_library_insight'  — competitor ad triggered campaign idea
  --   'campaign_created'    — campaign was created in 60
  --   'lead_captured'       — lead gen form submission received
  --   'contact_created'     — contact record created from lead
  --   'deal_created'        — deal opened from LinkedIn-sourced contact
  --   'deal_won'            — deal closed-won with LinkedIn attribution

  source_entity_id uuid,
  source_entity_type text,
  -- e.g. 'linkedin_ad_library_ads', 'linkedin_managed_campaigns'

  target_entity_id uuid,
  target_entity_type text,
  -- e.g. 'linkedin_managed_campaigns', 'contacts', 'deals'

  metadata jsonb DEFAULT '{}'::jsonb,
  -- Flexible store for: campaign_name, ad_headline, deal_value, etc.

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_linkedin_attribution_events_org_created
  ON public.linkedin_attribution_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_linkedin_attribution_events_type
  ON public.linkedin_attribution_events (org_id, event_type);

CREATE INDEX IF NOT EXISTS idx_linkedin_attribution_events_source
  ON public.linkedin_attribution_events (source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linkedin_attribution_events_target
  ON public.linkedin_attribution_events (target_entity_id)
  WHERE target_entity_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.linkedin_attribution_events ENABLE ROW LEVEL SECURITY;

-- RLS: org members can SELECT their org's attribution events
DROP POLICY IF EXISTS "org_members_select_attribution_events" ON public.linkedin_attribution_events;
CREATE POLICY "org_members_select_attribution_events"
  ON public.linkedin_attribution_events
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

-- RLS: org members can INSERT attribution events for their org
DROP POLICY IF EXISTS "org_members_insert_attribution_events" ON public.linkedin_attribution_events;
CREATE POLICY "org_members_insert_attribution_events"
  ON public.linkedin_attribution_events
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM public.organization_memberships om
      WHERE om.user_id = auth.uid()
    )
  );

-- Service role inserts from edge functions bypass RLS automatically.
