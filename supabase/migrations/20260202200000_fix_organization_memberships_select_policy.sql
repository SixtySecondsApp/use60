-- Fix organization_memberships SELECT policy to allow all members to see all members
-- Members need to see all team members in their organization, not just their own row

DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

-- Updated policy: Members can see all members in their organization
CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
  FOR SELECT
  USING (
    "public"."is_service_role"()
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'readonly'::"text"]))
  );
