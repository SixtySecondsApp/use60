-- Allow platform admins to view and edit all organizations in the admin dashboard
-- This enables admins to manage organizations they don't directly belong to

DROP POLICY IF EXISTS "organizations_select" ON "public"."organizations";

DO $$ BEGIN
  CREATE POLICY "organizations_select" ON "public"."organizations"
  FOR SELECT
  USING (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR "public"."is_org_member"("auth"."uid"(), "id")
    OR ("created_by" = "auth"."uid"())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update UPDATE policy to allow platform admins
DROP POLICY IF EXISTS "organizations_update" ON "public"."organizations";

DO $$ BEGIN
  CREATE POLICY "organizations_update" ON "public"."organizations"
  FOR UPDATE
  USING (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR ("public"."get_org_role"("auth"."uid"(), "id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  )
  WITH CHECK (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR ("public"."get_org_role"("auth"."uid"(), "id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
