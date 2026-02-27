-- Migration: CLIENT-001 — Client Fact Profiles Schema
-- Purpose: Create client_fact_profiles table for storing structured company
--          research data, approval workflows, and external sharing capabilities.
-- Date: 2026-02-11

-- =============================================================================
-- Step 1: client_fact_profiles — Structured company research per org
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_fact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),

  -- Company identity
  company_name TEXT NOT NULL,
  company_domain TEXT,
  company_logo_url TEXT,

  -- Profile classification
  profile_type TEXT DEFAULT 'client_org' CHECK (profile_type IN ('client_org', 'target_company')),

  -- Research data (structured JSONB with 8 sections)
  research_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  research_sources JSONB DEFAULT '[]'::JSONB,
  research_status TEXT DEFAULT 'pending' CHECK (research_status IN ('pending', 'researching', 'complete', 'failed')),

  -- Approval workflow
  approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_review', 'approved', 'changes_requested', 'archived')),
  approval_feedback TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,

  -- External sharing
  share_token UUID DEFAULT gen_random_uuid(),
  is_public BOOLEAN DEFAULT false,
  share_password_hash TEXT,
  share_views INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  share_expires_at TIMESTAMPTZ,

  -- ICP links
  linked_icp_profile_ids UUID[] DEFAULT '{}',

  -- Versioning
  version INTEGER DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.client_fact_profiles IS 'Structured company research profiles. Each profile stores research data, approval status, and external sharing configuration for a target company.';
COMMENT ON COLUMN public.client_fact_profiles.profile_type IS 'Classification: client_org (existing client) or target_company (prospecting target).';
COMMENT ON COLUMN public.client_fact_profiles.research_data IS 'JSONB with 8 structured research sections (overview, financials, technology, competitors, etc.).';
COMMENT ON COLUMN public.client_fact_profiles.research_sources IS 'JSONB array of sources used to compile the research data.';
COMMENT ON COLUMN public.client_fact_profiles.research_status IS 'Research pipeline status: pending -> researching -> complete or failed.';
COMMENT ON COLUMN public.client_fact_profiles.approval_status IS 'Approval workflow: draft -> pending_review -> approved/changes_requested -> archived.';
COMMENT ON COLUMN public.client_fact_profiles.share_token IS 'Unique token for external (unauthenticated) sharing links.';
COMMENT ON COLUMN public.client_fact_profiles.is_public IS 'Whether the profile is publicly accessible via share_token.';
COMMENT ON COLUMN public.client_fact_profiles.share_expires_at IS 'Optional expiry timestamp for the external share link.';
COMMENT ON COLUMN public.client_fact_profiles.linked_icp_profile_ids IS 'Array of icp_profiles IDs this company matches against.';
COMMENT ON COLUMN public.client_fact_profiles.version IS 'Incremented on each significant research update.';

-- =============================================================================
-- Step 2: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_client_fact_profiles_organization_id
  ON public.client_fact_profiles(organization_id);

CREATE INDEX IF NOT EXISTS idx_client_fact_profiles_company_domain
  ON public.client_fact_profiles(company_domain);

CREATE INDEX IF NOT EXISTS idx_client_fact_profiles_approval_status
  ON public.client_fact_profiles(approval_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_fact_profiles_share_token
  ON public.client_fact_profiles(share_token);

-- =============================================================================
-- Step 3: updated_at trigger for client_fact_profiles
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_client_fact_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_client_fact_profiles_updated_at
  BEFORE UPDATE ON public.client_fact_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_fact_profiles_updated_at();

-- =============================================================================
-- Step 4: Row Level Security — client_fact_profiles
-- =============================================================================

ALTER TABLE public.client_fact_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can view profiles in their org
DO $$ BEGIN
  CREATE POLICY "Org members can view client_fact_profiles"
  ON public.client_fact_profiles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SELECT: anonymous/public access via share_token when is_public = true and not expired
DO $$ BEGIN
  CREATE POLICY "Public access to shared client_fact_profiles"
  ON public.client_fact_profiles
  FOR SELECT
  USING (
    is_public = true
    AND (share_expires_at IS NULL OR share_expires_at > now())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT: org members can create profiles (with created_by = auth.uid())
DO $$ BEGIN
  CREATE POLICY "Org members can create client_fact_profiles"
  ON public.client_fact_profiles
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- UPDATE: creator or org admins can update
DO $$ BEGIN
  CREATE POLICY "Creator or admin can update client_fact_profiles"
  ON public.client_fact_profiles
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DELETE: creator or org admins can delete
DO $$ BEGIN
  CREATE POLICY "Creator or admin can delete client_fact_profiles"
  ON public.client_fact_profiles
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role full access
DO $$ BEGIN
  CREATE POLICY "Service role full access to client_fact_profiles"
  ON public.client_fact_profiles
  FOR ALL
  USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
