-- =============================================================================
-- OFP-001 + OFP-008: Org fact profile flag, CRM linking, Ops context profile
-- =============================================================================
-- Adds:
--   1. is_org_profile flag to client_fact_profiles (one per org)
--   2. CRM linking columns (contact, deal, company domain)
--   3. context_profile_id to dynamic_tables (Ops profile focus)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add is_org_profile flag to client_fact_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.client_fact_profiles
  ADD COLUMN IF NOT EXISTS is_org_profile BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_fact_profiles.is_org_profile IS
  'When true, this fact profile represents the organization itself. Only one per org.';

-- Partial unique index: enforce at most one org profile per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_org_profile_per_org
  ON public.client_fact_profiles (organization_id)
  WHERE is_org_profile = true;

-- ---------------------------------------------------------------------------
-- 2. Add CRM linking columns to client_fact_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.client_fact_profiles
  ADD COLUMN IF NOT EXISTS linked_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_company_domain TEXT;

COMMENT ON COLUMN public.client_fact_profiles.linked_contact_id IS
  'Optional link to a CRM contact record';
COMMENT ON COLUMN public.client_fact_profiles.linked_deal_id IS
  'Optional link to a CRM deal record';
COMMENT ON COLUMN public.client_fact_profiles.linked_company_domain IS
  'Optional company domain for linking (no FK — matches by domain)';

-- Indexes for FK lookups
CREATE INDEX IF NOT EXISTS idx_fact_profiles_linked_contact
  ON public.client_fact_profiles (linked_contact_id)
  WHERE linked_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fact_profiles_linked_deal
  ON public.client_fact_profiles (linked_deal_id)
  WHERE linked_deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fact_profiles_linked_company_domain
  ON public.client_fact_profiles (linked_company_domain)
  WHERE linked_company_domain IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Add context_profile_id to dynamic_tables (Ops profile focus)
-- ---------------------------------------------------------------------------

ALTER TABLE public.dynamic_tables
  ADD COLUMN IF NOT EXISTS context_profile_id UUID REFERENCES public.client_fact_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dynamic_tables.context_profile_id IS
  'Fact profile used as context for enrichment ${variables}. NULL = use org profile fallback.';

CREATE INDEX IF NOT EXISTS idx_dynamic_tables_context_profile
  ON public.dynamic_tables (context_profile_id)
  WHERE context_profile_id IS NOT NULL;
