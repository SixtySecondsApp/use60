-- Migration: PIPE-001 — Product Profiles Schema
-- Purpose: Create product_profiles table for storing structured product/service
--          research data linked to company fact profiles.
-- Date: 2026-02-12

-- =============================================================================
-- Step 1: product_profiles — Structured product research per org
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fact_profile_id UUID REFERENCES public.client_fact_profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),

  -- Product identity
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('SaaS', 'Service', 'Platform', 'Hardware', 'Consulting', 'Other')),
  product_url TEXT,
  logo_url TEXT,

  -- Research data
  research_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  research_sources JSONB DEFAULT '[]'::JSONB,
  research_status TEXT NOT NULL DEFAULT 'pending' CHECK (research_status IN ('pending', 'researching', 'complete', 'failed')),

  -- Flags
  is_primary BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.product_profiles IS 'Structured product/service profiles. Each profile stores research data about a product, optionally linked to a company fact profile.';
COMMENT ON COLUMN public.product_profiles.fact_profile_id IS 'Optional link to the company (client_fact_profiles) that owns/sells this product.';
COMMENT ON COLUMN public.product_profiles.category IS 'Product classification: SaaS, Service, Platform, Hardware, Consulting, or Other.';
COMMENT ON COLUMN public.product_profiles.research_data IS 'JSONB with structured product research sections.';
COMMENT ON COLUMN public.product_profiles.research_sources IS 'JSONB array of sources used to compile the research data.';
COMMENT ON COLUMN public.product_profiles.research_status IS 'Research pipeline status: pending -> researching -> complete or failed.';
COMMENT ON COLUMN public.product_profiles.is_primary IS 'Marks the main/flagship product for a company.';

-- =============================================================================
-- Step 2: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_product_profiles_organization_id
  ON public.product_profiles(organization_id);

CREATE INDEX IF NOT EXISTS idx_product_profiles_fact_profile_id
  ON public.product_profiles(fact_profile_id);

-- =============================================================================
-- Step 3: updated_at trigger for product_profiles
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_product_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_product_profiles_updated_at
  BEFORE UPDATE ON public.product_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_profiles_updated_at();

-- =============================================================================
-- Step 4: Row Level Security — product_profiles
-- =============================================================================

ALTER TABLE public.product_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can view profiles in their org
CREATE POLICY "Org members can view product_profiles"
  ON public.product_profiles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: org members can create profiles (with created_by = auth.uid())
CREATE POLICY "Org members can create product_profiles"
  ON public.product_profiles
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: creator or org admins can update
CREATE POLICY "Creator or admin can update product_profiles"
  ON public.product_profiles
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
CREATE POLICY "Creator or admin can delete product_profiles"
  ON public.product_profiles
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
CREATE POLICY "Service role full access to product_profiles"
  ON public.product_profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
