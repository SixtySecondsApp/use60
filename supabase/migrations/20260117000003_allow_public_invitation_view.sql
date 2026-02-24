-- Allow unauthenticated users to view invitations by token
-- This is necessary for the invitation acceptance flow to work
-- Users must have the valid token to view the invitation (filtering done in application)

-- First, check if the policy already exists and drop it if it does
DROP POLICY IF EXISTS "Anyone can view invitations by valid token" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Allow public invitation view by token" ON "public"."organization_invitations";

-- Create permissive policy for SELECT - allows public access
CREATE POLICY "Allow public invitation view by token" ON "public"."organization_invitations"
FOR SELECT
USING (true);
