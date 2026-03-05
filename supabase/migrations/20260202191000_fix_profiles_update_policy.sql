-- Fix profiles_update policy by adding explicit WITH CHECK clause
-- This ensures users can both select and modify their own profile rows

-- Drop the old policy
DROP POLICY IF EXISTS "profiles_update" ON "public"."profiles";

-- Create new policy with explicit WITH CHECK clause
DO $$ BEGIN
  CREATE POLICY "profiles_update" ON "public"."profiles"
  FOR UPDATE
  USING (
    "public"."is_service_role"()
    OR ("id" = ( SELECT "auth"."uid"() AS "uid"))
    OR "public"."is_admin_optimized"()
  )
  WITH CHECK (
    "public"."is_service_role"()
    OR ("id" = ( SELECT "auth"."uid"() AS "uid"))
    OR "public"."is_admin_optimized"()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
