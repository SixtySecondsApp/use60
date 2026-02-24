-- Fix organization_memberships SELECT policy to allow all members to see all members
-- Members need to see all team members in their organization, not just their own row
-- Platform admins should be able to view all organization memberships

DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

-- Updated policy: Members can see all members in their organization, and platform admins can see all
CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
  FOR SELECT
  USING (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'readonly'::"text"]))
  );
