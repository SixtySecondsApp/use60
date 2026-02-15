-- Migration: ICP-R-001 — ICP Persona Redesign
-- Purpose: Add parent_icp_id column, rename ibp→persona, extend criteria for nested personas
-- Date: 2026-02-19

-- =============================================================================
-- Step 1: Add parent_icp_id column for persona hierarchy
-- =============================================================================

-- Add parent_icp_id column to support personas nested under ICPs
ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS parent_icp_id UUID REFERENCES public.icp_profiles(id) ON DELETE SET NULL;

-- Create index for efficient parent lookups
CREATE INDEX IF NOT EXISTS idx_icp_profiles_parent_icp_id
  ON public.icp_profiles(parent_icp_id);

COMMENT ON COLUMN public.icp_profiles.parent_icp_id IS 'Parent ICP for personas. NULL for top-level ICPs.';

-- =============================================================================
-- Step 2: Rename profile_type from 'ibp' to 'persona'
-- =============================================================================

-- Update all existing 'ibp' rows to 'persona'
UPDATE public.icp_profiles
  SET profile_type = 'persona'
  WHERE profile_type = 'ibp';

-- Drop existing CHECK constraint on profile_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'icp_profiles_profile_type_check'
    AND conrelid = 'public.icp_profiles'::regclass
  ) THEN
    ALTER TABLE public.icp_profiles
      DROP CONSTRAINT icp_profiles_profile_type_check;
  END IF;
END $$;

-- Add new CHECK constraint with updated values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'icp_profiles_profile_type_check'
    AND conrelid = 'public.icp_profiles'::regclass
  ) THEN
    ALTER TABLE public.icp_profiles
      ADD CONSTRAINT icp_profiles_profile_type_check
      CHECK (profile_type IN ('icp', 'persona'));
  END IF;
END $$;

-- Update column comment to reflect new terminology
COMMENT ON COLUMN public.icp_profiles.profile_type IS 'Profile type: icp (Ideal Customer Profile) or persona (Ideal Buyer Persona).';

-- =============================================================================
-- Step 3: Recreate composite index with new profile_type values
-- =============================================================================

-- Drop existing composite index if it exists
DROP INDEX IF EXISTS idx_icp_profiles_org_type_status;

-- Recreate composite index (will use new 'persona' values)
CREATE INDEX IF NOT EXISTS idx_icp_profiles_org_type_status
  ON public.icp_profiles(organization_id, profile_type, status);

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
