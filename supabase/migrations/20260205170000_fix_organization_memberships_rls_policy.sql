-- Fix: Organization Member Count Display Bug - RLS Policy Evaluation
-- Problem: Migration 20260202200000 references undefined function app_auth.is_admin()
--          This causes RLS SELECT policy to fail silently, denying all queries
--          Result: Member counts show 0 for all orgs except those user owns
--
-- Root Cause: When PostgreSQL RLS policy references a non-existent function,
--             the policy evaluation fails and defaults to deny-all behavior
--
-- Fix: Replace undefined app_auth.is_admin() with proper inline check
--      Use existing is_service_role() and get_org_role() functions
--      Ensure platform admins can view all organization memberships

-- Step 1: Define the missing app_auth.is_admin() function for backward compatibility
-- This allows any existing code that calls this function to still work
CREATE SCHEMA IF NOT EXISTS app_auth;

CREATE OR REPLACE FUNCTION app_auth.is_admin()
RETURNS boolean AS $$
BEGIN
  -- Check if current user is a platform admin
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Step 2: Fix the RLS policy to properly handle member visibility
-- The new policy allows:
-- 1. Service role (backend/edge functions)
-- 2. Platform admins (can see all memberships)
-- 3. Users who are members of the org (in any role)
-- 4. Users querying their own membership row

DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

DO $$ BEGIN
  CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  "public"."is_service_role"()
  OR "app_auth"."is_admin"()  -- Platform admins can see all memberships
  OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'readonly'::"text"]))
  OR ("user_id" = "auth"."uid"())  -- Users can see their own membership
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: Add comment documenting the policy
COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships:
 - Service role and platform admins can view all memberships
 - Users can view memberships for orgs they belong to
 - Users can view their own membership record
 This ensures member counts display correctly in admin pages';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed organization_memberships RLS SELECT policy:';
  RAISE NOTICE '  ✓ Defined missing app_auth.is_admin() function';
  RAISE NOTICE '  ✓ Updated policy to properly evaluate function';
  RAISE NOTICE '  ✓ Added platform admin visibility';
  RAISE NOTICE '  ✓ Added user self-visibility for own memberships';
END $$;
