-- Migration: Auto-create profile when auth user is created
-- Purpose: Bypass RLS issues by creating profile server-side via trigger
-- This runs BEFORE the client tries to upsert, so profile always exists

-- Create a function that creates a profile for new auth users
CREATE OR REPLACE FUNCTION public.create_profile_on_auth_user_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create profile if it doesn't already exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      profile_status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      'active',
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;

    RAISE LOG '[create_profile_on_auth_user_created] Created profile for user: %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_create_profile_on_auth_signup ON auth.users;

-- Create trigger to run this function when auth.users is created
CREATE TRIGGER trigger_create_profile_on_auth_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_profile_on_auth_user_created();

-- Add comment
COMMENT ON FUNCTION public.create_profile_on_auth_user_created() IS 'Automatically creates a profile in public.profiles when a new auth user is created. This ensures profiles always exist and bypasses RLS issues during signup.';
