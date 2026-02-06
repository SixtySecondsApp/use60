-- Fix RLS policies for organization_invitations table
-- Remove policies that require direct access to auth.users table
-- This eliminates "permission denied for table users" errors

-- Drop the problematic SELECT policies
DROP POLICY IF EXISTS "Users can view invitations in their organizations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Users can view their own pending invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "organization_invitations_select" ON "public"."organization_invitations";

-- Create consolidated SELECT policy that allows:
-- 1. Service role (for edge functions, migrations)
-- 2. Super admins (platform admins)
-- 3. Organization owners and admins
-- 4. Users viewing their own pending invitations (using JWT email, not auth.users join)
CREATE POLICY "organization_invitations_select" ON "public"."organization_invitations"
  FOR SELECT
  USING (
    "public"."is_service_role"()
    OR "public"."is_admin_optimized"()
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
    -- Allow users to view their own pending invitations using JWT email claim
    OR (
      "accepted_at" IS NULL
      AND "expires_at" > "now"()
      AND "lower"(("email")::"text") = "lower"(("auth"."jwt"() ->> 'email')::text)
    )
  );
