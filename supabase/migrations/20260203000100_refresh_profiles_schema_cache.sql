-- Force Supabase schema cache refresh for profiles table
-- This ensures the redirect_to_onboarding column added in migration 20260202093841 is recognized by the REST API

-- Modify the table comment to force cache invalidation
COMMENT ON TABLE public.profiles IS 'User profiles table - cache reload triggered at 2026-02-03 00:01:00';
