-- Migration: Clean up profiles with missing profile_status and affected profiles from signup bug
-- Purpose: Fix existing users affected by the signup bug where profile_status column was incorrectly named

-- Step 1: Clean up profiles with missing profile_status
-- Set default profile_status for any profiles without it (should only apply to confirmed users)
UPDATE profiles
SET profile_status = 'active'
WHERE profile_status IS NULL
  AND id IN (
    SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL
  );

-- Step 2: Log affected profiles with missing names (affected by the signup bug)
-- These will need manual correction or re-onboarding
-- Created TEMP table to identify which profiles need attention
CREATE TEMP TABLE affected_profiles AS
SELECT id, email, created_at
FROM profiles
WHERE (first_name IS NULL OR first_name = '')
  AND (last_name IS NULL OR last_name = '')
  AND created_at > '2026-01-20 00:00:00'; -- Only recent signups

-- Step 3: Display count of affected profiles
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO affected_count FROM affected_profiles;
  RAISE NOTICE 'Migration 20260121000007: Found % profiles affected by signup bug', affected_count;
END $$;

-- Note: Affected profiles are now identifiable via the temp table above
-- These users will need either:
-- 1. To update their profile with first/last names via Settings page
-- 2. To re-onboard through the updated signup flow
-- The temp table will be automatically cleaned up after migration completes
