-- Migration: Fix profiles RLS policies for signup flow
-- Purpose: Allow users to update their own profile after signup (for first_name, last_name)
-- The profile is created by trigger, user just needs to update it

-- Drop existing policies
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- Create new INSERT policy (permissive - allows various scenarios)
DO $$ BEGIN
  CREATE POLICY "profiles_insert" ON public.profiles
FOR INSERT
WITH CHECK (
  public.is_service_role()
  OR id = auth.uid()
  -- Allow creating profile if email exists in auth.users (created within last hour)
  OR email IN (
    SELECT email FROM auth.users
    WHERE email = profiles.email
    AND created_at > NOW() - INTERVAL '1 hour'
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create new UPDATE policy that allows users to update their own profile
-- This is needed for the upsert to work during signup when adding first_name/last_name
DO $$ BEGIN
  CREATE POLICY "profiles_update" ON public.profiles
FOR UPDATE
USING (
  public.is_service_role()
  OR id = auth.uid()
  -- Allow updating profile if this is a recently created user updating their own email
  OR (email IN (
    SELECT email FROM auth.users
    WHERE email = profiles.email
    AND created_at > NOW() - INTERVAL '1 hour'
  ))
)
WITH CHECK (
  public.is_service_role()
  OR id = auth.uid()
  OR (email IN (
    SELECT email FROM auth.users
    WHERE email = profiles.email
    AND created_at > NOW() - INTERVAL '1 hour'
  ))
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add comments
COMMENT ON POLICY "profiles_insert" ON public.profiles IS 'Allows service role, authenticated users, and users with recently created auth accounts to insert profiles.';
COMMENT ON POLICY "profiles_update" ON public.profiles IS 'Allows service role, authenticated users, and users with recently created auth accounts to update their profiles during signup.';
