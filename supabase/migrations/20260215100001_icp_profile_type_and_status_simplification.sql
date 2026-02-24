-- Migration: ICP-001 — Add profile_type column and simplify status to active/archived
-- Purpose: Add profile_type (icp/ibp) and simplify status lifecycle from 6 states to 2 (active/archived)
-- Date: 2026-02-15

-- =============================================================================
-- Step 1: Add profile_type column with CHECK constraint
-- =============================================================================

-- Add profile_type column with default 'icp'
ALTER TABLE public.icp_profiles
  ADD COLUMN IF NOT EXISTS profile_type TEXT NOT NULL DEFAULT 'icp';

-- Add CHECK constraint for profile_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'icp_profiles_profile_type_check'
    AND conrelid = 'public.icp_profiles'::regclass
  ) THEN
    ALTER TABLE public.icp_profiles
      ADD CONSTRAINT icp_profiles_profile_type_check
      CHECK (profile_type IN ('icp', 'ibp'));
  END IF;
END $$;

-- Set all existing rows to profile_type = 'icp' (idempotent - already default)
UPDATE public.icp_profiles
  SET profile_type = 'icp'
  WHERE profile_type IS NULL OR profile_type != 'icp';

COMMENT ON COLUMN public.icp_profiles.profile_type IS 'Profile type: icp (Ideal Customer Profile) or ibp (Ideal Buyer Persona).';

-- =============================================================================
-- Step 2: Migrate status values and simplify status constraint
-- =============================================================================

-- Migrate all non-archived statuses to 'active'
UPDATE public.icp_profiles
  SET status = 'active'
  WHERE status IN ('draft', 'testing', 'pending_approval', 'approved');

-- Drop old status CHECK constraint if it exists
DO $$
BEGIN
  -- Find and drop the constraint by searching pg_constraint
  -- The constraint might be auto-named or explicitly named
  DECLARE
    constraint_name TEXT;
  BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.icp_profiles'::regclass
      AND contype = 'c'  -- CHECK constraint
      AND pg_get_constraintdef(oid) LIKE '%status%'
      AND conname LIKE '%status%';

    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.icp_profiles DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END IF;
  END;
END $$;

-- Add new simplified status CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'icp_profiles_status_check'
    AND conrelid = 'public.icp_profiles'::regclass
  ) THEN
    ALTER TABLE public.icp_profiles
      ADD CONSTRAINT icp_profiles_status_check
      CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

-- Update comment to reflect new simplified status values
COMMENT ON COLUMN public.icp_profiles.status IS 'Simplified status: active or archived.';

-- =============================================================================
-- Step 3: Add index on profile_type for efficient filtering
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_icp_profiles_profile_type
  ON public.icp_profiles(profile_type);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_org_type_status
  ON public.icp_profiles(organization_id, profile_type, status);

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
