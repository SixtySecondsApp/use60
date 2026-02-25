-- Migration: Allow users to create their own profiles after signup
-- Issue: signup creates auth user but can't create profile because auth.uid() is NULL
-- Solution: Add exception to RLS to allow initial profile creation via email verification

-- Drop the old profiles_insert policy
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

-- Create new policy that allows:
-- 1. Service role (for edge functions)
-- 2. Users to insert their own profile (id = auth.uid())
-- 3. Special case: Allow insertion if creating profile for an unverified email in auth.users
DO $$ BEGIN
  CREATE POLICY "profiles_insert" ON public.profiles
FOR INSERT
WITH CHECK (
  public.is_service_role()
  OR id = auth.uid()
  -- Allow creating profile if this email exists in auth.users but profile doesn't yet
  -- This handles the immediate post-signup case before user is signed in
  OR email IN (
    SELECT email FROM auth.users
    WHERE email = profiles.email
    AND created_at > NOW() - INTERVAL '1 hour'  -- Only within 1 hour of user creation
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add comment explaining the policy
COMMENT ON POLICY "profiles_insert" ON public.profiles IS 'Allows service role, users to insert their own profile, and allows initial profile creation immediately after signup via email match in auth.users';
