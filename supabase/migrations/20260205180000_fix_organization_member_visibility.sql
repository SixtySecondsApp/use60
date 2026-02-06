-- Fix: Organization Member Visibility in Admin Page
-- Problem: Users cannot see member counts or owner information for organizations
--          even though the data exists in the database
--
-- Root Cause: RLS policy requires users to BE members of an org to see ANY members
--            This prevents viewing org member lists and owner info
--
-- For the admin/platform page use case:
-- - Users should see organizations they own/manage
-- - Users should see member counts for orgs they're members of
-- - Platform admins should see everything
-- - The policy should allow reading member data when user has ANY role in the org
--
-- Note: This is a security model decision - organizations maintain their own
--       member lists. The RLS policy enforces that only org members can see
--       who else is in that org (prevents exposing org membership externally).

-- Update the RLS policy to be clearer about the member visibility rules
DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  -- Case 1: Service role (edge functions, server-side operations)
  "public"."is_service_role"()
  OR
  -- Case 2: Platform admins can see all organization memberships
  "app_auth"."is_admin"()
  OR
  -- Case 3: Users can see all members of organizations they belong to
  -- This is key: if user has ANY role (owner, admin, member, readonly) in the org,
  -- they can see all members including owner info
  ("public"."get_org_role"("auth"."uid"(), "org_id") IS NOT NULL)
  OR
  -- Case 4: Users can always see their own membership row
  ("user_id" = "auth"."uid"())
);

-- Update policy comment for clarity
COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships:
 Rules for viewing membership data:
 1. Service role can view all (edge functions, backend)
 2. Platform admins (is_admin=true) can view all
 3. Users who are members of an org (ANY role) can see all members of that org
 4. Users can always see their own membership record

 Security model: An organization''s member list is private to members.
 Only people already in the organization can see who else is in it.
 This is enforced at the RLS level.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Updated organization_memberships RLS policy:';
  RAISE NOTICE '  ✓ Changed role check from = ANY to IS NOT NULL';
  RAISE NOTICE '  ✓ Users with ANY org role can now see all members';
  RAISE NOTICE '  ✓ Owner info will display when querying org members';
  RAISE NOTICE '  ✓ Member counts will work for organizations user belongs to';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Important: This means:';
  RAISE NOTICE '  - Users can ONLY see member counts for orgs they''re in';
  RAISE NOTICE '  - Admin page should only display accessible organizations';
  RAISE NOTICE '  - Platform admins (is_admin=true) can see all orgs';
END $$;
