-- Migration: PIPE-002 — Link ICP profiles to fact profiles and product profiles
-- Purpose: Add fact_profile_id and product_profile_id FK columns to icp_profiles
--          so ICPs can track which company profile and product they were derived from.
-- Date: 2026-02-12

-- =============================================================================
-- Step 1: Add fact_profile_id column
-- =============================================================================

ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS fact_profile_id UUID
  REFERENCES public.client_fact_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.icp_profiles.fact_profile_id
  IS 'Links ICP to the company fact profile it was derived from. Nullable — existing ICPs without a link continue to work.';

-- =============================================================================
-- Step 2: Add product_profile_id column
-- =============================================================================

ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS product_profile_id UUID
  REFERENCES public.product_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.icp_profiles.product_profile_id
  IS 'Links ICP to a specific product profile. Nullable — existing ICPs without a link continue to work.';

-- =============================================================================
-- Step 3: Indexes for FK lookup performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_icp_profiles_fact_profile_id
  ON public.icp_profiles(fact_profile_id);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_product_profile_id
  ON public.icp_profiles(product_profile_id);

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
