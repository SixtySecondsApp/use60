-- =============================================================================
-- Migration: Unique domain constraint + lead linking for client_fact_profiles
-- Purpose: Enable upsert of company fact profiles by (org, domain) from lead
--          pipeline, and add lead_id linking for traceability.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Partial unique index: one fact profile per (org, domain) for non-org profiles
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_profiles_org_domain_unique
  ON public.client_fact_profiles (organization_id, company_domain)
  WHERE company_domain IS NOT NULL AND is_org_profile = false;

COMMENT ON INDEX public.idx_fact_profiles_org_domain_unique IS
  'Ensures at most one target_company fact profile per domain per org. Enables upsert from lead pipeline.';

-- ---------------------------------------------------------------------------
-- 2. Add research_started_at / research_completed_at for freshness checks
-- ---------------------------------------------------------------------------

ALTER TABLE public.client_fact_profiles
  ADD COLUMN IF NOT EXISTS research_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS research_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_fact_profiles.research_started_at IS
  'Timestamp when the most recent research run started.';
COMMENT ON COLUMN public.client_fact_profiles.research_completed_at IS
  'Timestamp when research finished. Used by meeting-prep to check data freshness.';

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
