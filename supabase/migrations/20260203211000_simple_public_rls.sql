-- Simple RLS: Allow public SELECT on organization_invitations
-- Drop all existing SELECT policies first
DROP POLICY IF EXISTS "organization_invitations_select" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public token lookup for invitation acceptance" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public invitation view by token" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Users can view invitations in their organizations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Users can view their own pending invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "organization_invitations_public_select" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "allow_select_all" ON "public"."organization_invitations";

-- Create single permissive policy that allows SELECT for everyone
DO $$ BEGIN
  CREATE POLICY "organization_invitations_public_select" ON "public"."organization_invitations"
  FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
