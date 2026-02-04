-- Re-enable RLS on organization_invitations table
-- Previously disabled as a "temporary fix" in 20260203210100_fix_public_invitation_rls.sql
-- This was a security risk: any authenticated user could query ALL invitations

-- Step 1: Re-enable RLS
ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing policies to start clean
DROP POLICY IF EXISTS "Users can view invitations sent to their email" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Org admins can view their org invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Org admins can create invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Org admins can update their org invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Org admins can delete their org invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public invitation lookup by token" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow anyone to select invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "allow_select_by_token" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "allow_select_own_invitations" ON "public"."organization_invitations";

-- Step 3: Create proper RLS policies

-- Users can see invitations sent to their email address
CREATE POLICY "Users can view invitations sent to their email"
  ON "public"."organization_invitations"
  FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Org admins and owners can see all invitations for their organization
CREATE POLICY "Org admins can view their org invitations"
  ON "public"."organization_invitations"
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

-- Org admins and owners can create invitations for their organization
CREATE POLICY "Org admins can create invitations"
  ON "public"."organization_invitations"
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

-- Org admins and owners can update invitations for their organization
CREATE POLICY "Org admins can update their org invitations"
  ON "public"."organization_invitations"
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

-- Org admins and owners can delete/revoke invitations for their organization
CREATE POLICY "Org admins can delete their org invitations"
  ON "public"."organization_invitations"
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

-- Note: The get-invitation-by-token edge function and complete_invite_signup RPC
-- use the service role key which bypasses RLS entirely, so token lookups still work.
