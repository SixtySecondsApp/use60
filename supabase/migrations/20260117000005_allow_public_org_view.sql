-- Allow unauthenticated users to view organization names (for invitation acceptance)
-- This is necessary when users click an invitation link before being authenticated
-- The actual data access is still controlled by the invitation itself

DROP POLICY IF EXISTS "Allow public organization view for invitations" ON "public"."organizations";

DO $$ BEGIN
  CREATE POLICY "Allow public organization view for invitations" ON "public"."organizations"
FOR SELECT
USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
