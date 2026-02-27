-- Fix organization_invitations SELECT policy to allow org admins to view invitations
-- Organization owners and admins need to see pending invitations for their organization
-- This fixes 403 errors when trying to list invitations

DROP POLICY IF EXISTS "organization_invitations_select" ON "public"."organization_invitations";

-- Updated policy: Service role, super admins, and org owners/admins can view invitations
DO $$ BEGIN
  CREATE POLICY "organization_invitations_select" ON "public"."organization_invitations"
  FOR SELECT
  USING (
    "public"."is_service_role"()
    OR "public"."is_admin_optimized"()
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
