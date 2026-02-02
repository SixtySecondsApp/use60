-- Allow platform admins to manage organization members in the admin view
-- This enables admins to modify organization memberships across all organizations

-- Update INSERT policy to allow platform admins to add members
DROP POLICY IF EXISTS "organization_memberships_insert" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_insert" ON "public"."organization_memberships"
  FOR INSERT
  WITH CHECK (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR (("user_id" = "auth"."uid"()) AND ("role" = 'owner'::"text") AND (EXISTS ( SELECT 1 FROM "public"."organizations" "o" WHERE (("o"."id" = "organization_memberships"."org_id") AND ("o"."created_by" = "auth"."uid"())))))
    OR (("user_id" = "auth"."uid"()) AND ("role" = 'member'::"text"))
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  );

-- Update UPDATE policy to allow platform admins
DROP POLICY IF EXISTS "organization_memberships_update" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_update" ON "public"."organization_memberships"
  FOR UPDATE
  USING (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  )
  WITH CHECK (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  );

-- Update DELETE policy to allow platform admins
DROP POLICY IF EXISTS "organization_memberships_delete" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_delete" ON "public"."organization_memberships"
  FOR DELETE
  USING (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR ("user_id" = "auth"."uid"())
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  );
