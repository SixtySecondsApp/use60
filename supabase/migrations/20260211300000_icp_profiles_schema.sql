-- Migration: PROSPECT-001 — ICP Profiles & Search History Schema
-- Purpose: Create icp_profiles table for Ideal Customer Profile management
--          and icp_search_history for tracking prospecting searches.
-- Date: 2026-02-11

-- =============================================================================
-- Step 1: icp_profiles — Ideal Customer Profile definitions per org
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.icp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}'::JSONB,
  target_provider TEXT DEFAULT 'apollo' CHECK (target_provider IN ('apollo', 'ai_ark', 'both')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'testing', 'pending_approval', 'approved', 'active', 'archived')),
  visibility TEXT DEFAULT 'team_only' CHECK (visibility IN ('team_only', 'shared', 'client_visible')),
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_test_result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_icp_name_per_org UNIQUE(organization_id, name)
);

COMMENT ON TABLE public.icp_profiles IS 'Ideal Customer Profile definitions. Each profile stores targeting criteria for prospecting searches.';
COMMENT ON COLUMN public.icp_profiles.criteria IS 'JSONB targeting criteria (industries, employee size, titles, locations, technologies, etc.).';
COMMENT ON COLUMN public.icp_profiles.target_provider IS 'Which search provider to use: apollo, ai_ark, or both.';
COMMENT ON COLUMN public.icp_profiles.status IS 'Lifecycle status: draft -> testing -> pending_approval -> approved -> active -> archived.';
COMMENT ON COLUMN public.icp_profiles.visibility IS 'Who can see this ICP: team_only, shared across org, or client_visible.';
COMMENT ON COLUMN public.icp_profiles.last_tested_at IS 'When the ICP was last used in a test search.';
COMMENT ON COLUMN public.icp_profiles.last_test_result_count IS 'Number of results returned by the last test search.';

-- =============================================================================
-- Step 2: icp_search_history — Track every prospecting search
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.icp_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icp_profile_id UUID REFERENCES public.icp_profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  searched_by UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT NOT NULL CHECK (provider IN ('apollo', 'ai_ark')),
  search_params JSONB NOT NULL,
  result_count INTEGER,
  credits_consumed NUMERIC(10,2),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.icp_search_history IS 'Immutable log of every prospecting search executed against a provider.';
COMMENT ON COLUMN public.icp_search_history.icp_profile_id IS 'The ICP profile used for this search (nullable for ad-hoc searches).';
COMMENT ON COLUMN public.icp_search_history.search_params IS 'Full search parameters sent to the provider API.';
COMMENT ON COLUMN public.icp_search_history.credits_consumed IS 'Provider credits consumed by this search.';
COMMENT ON COLUMN public.icp_search_history.duration_ms IS 'Search execution time in milliseconds.';

-- =============================================================================
-- Step 3: Indexes
-- =============================================================================

-- icp_profiles indexes
CREATE INDEX IF NOT EXISTS idx_icp_profiles_organization_id
  ON public.icp_profiles(organization_id);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_created_by
  ON public.icp_profiles(created_by);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_org_status
  ON public.icp_profiles(organization_id, status);

-- icp_search_history indexes
CREATE INDEX IF NOT EXISTS idx_icp_search_history_profile_id
  ON public.icp_search_history(icp_profile_id);

CREATE INDEX IF NOT EXISTS idx_icp_search_history_organization_id
  ON public.icp_search_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_icp_search_history_org_created
  ON public.icp_search_history(organization_id, created_at DESC);

-- =============================================================================
-- Step 4: updated_at trigger for icp_profiles
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_icp_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_icp_profiles_updated_at
  BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_icp_profiles_updated_at();

-- =============================================================================
-- Step 5: Row Level Security — icp_profiles
-- =============================================================================

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can view profiles in their org
CREATE POLICY "Org members can view icp_profiles"
  ON public.icp_profiles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: org members can create profiles (with created_by = auth.uid())
CREATE POLICY "Org members can create icp_profiles"
  ON public.icp_profiles
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: creator or org admins can update
CREATE POLICY "Creator or admin can update icp_profiles"
  ON public.icp_profiles
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

-- DELETE: creator or org admins can delete
CREATE POLICY "Creator or admin can delete icp_profiles"
  ON public.icp_profiles
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

-- Service role full access
CREATE POLICY "Service role full access to icp_profiles"
  ON public.icp_profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- Step 6: Row Level Security — icp_search_history
-- =============================================================================

ALTER TABLE public.icp_search_history ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can view search history
CREATE POLICY "Org members can view icp_search_history"
  ON public.icp_search_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: org members can insert search history
CREATE POLICY "Org members can insert icp_search_history"
  ON public.icp_search_history
  FOR INSERT
  WITH CHECK (
    searched_by = auth.uid()
    AND organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "Service role full access to icp_search_history"
  ON public.icp_search_history
  FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
