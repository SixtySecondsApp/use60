-- Migration: Enforce onboarding-only organization creation
--
-- Purpose: Ensure NO automatic organization creation happens during signup
-- Organizations should ONLY be created/joined through the onboarding V2 flow
--
-- This fixes issues where:
-- 1. Waitlist company_name was used to auto-create orgs
-- 2. Users without orgs got auto-assigned orgs (migration 20260126000009)
-- 3. Business email domains triggered automatic org creation
--
-- Expected behavior after this migration:
-- - Personal email (gmail.com, etc) → No org, must complete onboarding
-- - Business email → No org, onboarding will check for existing org by domain
-- - Onboarding V2 is the ONLY place where orgs are created/joined
--
-- ============================================================================
-- 1. Remove any triggers that auto-create organizations
-- ============================================================================

-- Drop trigger on profiles table (if it exists)
DROP TRIGGER IF EXISTS "trigger_auto_org_for_new_user" ON "public"."profiles";

-- Drop the function completely (if it exists)
DROP FUNCTION IF EXISTS "public"."auto_create_org_for_new_user"() CASCADE;

-- ============================================================================
-- 2. Verify no other triggers are creating organizations
-- ============================================================================

-- Check for any other triggers on auth.users that might create orgs
-- (We keep the profile creation trigger, but ensure it doesn't create orgs)
-- The create_profile_on_auth_user_created() function ONLY creates profiles, not orgs

-- ============================================================================
-- 3. Add migration verification
-- ============================================================================

DO $$
DECLARE
  v_trigger_count INTEGER;
  v_function_exists BOOLEAN;
BEGIN
  -- Check if the auto_create_org_for_new_user trigger still exists
  SELECT COUNT(*) INTO v_trigger_count
  FROM information_schema.triggers
  WHERE trigger_name = 'trigger_auto_org_for_new_user'
    AND event_object_table = 'profiles';

  -- Check if the function still exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'auto_create_org_for_new_user'
  ) INTO v_function_exists;

  IF v_trigger_count > 0 OR v_function_exists THEN
    RAISE EXCEPTION 'Failed to remove auto org creation triggers/functions';
  ELSE
    RAISE NOTICE '✅ Verified: No automatic org creation triggers exist';
    RAISE NOTICE '✅ Organization creation is now ONLY handled by onboarding V2';
  END IF;
END $$;

-- ============================================================================
-- 4. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE organizations IS
'Organizations table. Organizations are ONLY created through:
1. Onboarding V2 flow (website input → enrichment → org creation)
2. Manual admin creation
DO NOT auto-create organizations on signup or profile creation.';

COMMENT ON TABLE organization_memberships IS
'Organization memberships. Users join organizations through:
1. Onboarding V2 (create new or request to join existing)
2. Admin invitation
3. Join request approval
DO NOT auto-assign users to organizations on signup.';
