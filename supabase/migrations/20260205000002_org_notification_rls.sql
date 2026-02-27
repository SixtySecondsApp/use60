-- Migration: Update RLS policies for org-scoped notifications
-- Story: ORG-NOTIF-002
-- Description: Allow org admins/owners to view org-wide notifications while respecting privacy

-- Step 1: Drop existing SELECT policy and recreate with org-wide logic
DROP POLICY IF EXISTS "notifications_select" ON "public"."notifications";

DO $$ BEGIN
  CREATE POLICY "notifications_select" ON "public"."notifications"
FOR SELECT
USING (
  -- Service role can view all
  public.is_service_role()
  OR
  -- Users can view their own notifications
  (user_id = auth.uid())
  OR
  -- Org admins/owners can view org-wide notifications (that are not private)
  (
    is_org_wide = TRUE
    AND is_private = FALSE
    AND org_id IN (
      SELECT org_id
      FROM organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND member_status = 'active'
    )
  )
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Update other policies to maintain existing logic
-- (INSERT, UPDATE, DELETE remain service role or owner only)

-- Note: INSERT remains service role only (notifications created by system/triggers)
-- Note: UPDATE allows users to mark their own notifications as read
-- Note: DELETE allows users to delete their own notifications

-- Step 3: Add comment for documentation
COMMENT ON POLICY "notifications_select" ON "public"."notifications" IS
'Users can view their own notifications. Org admins/owners can also view org-wide notifications (unless marked private) for their organizations.';

-- Step 4: Verify the policy
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'notifications'
    AND policyname = 'notifications_select';

  IF policy_count = 1 THEN
    RAISE NOTICE 'RLS policy "notifications_select" successfully updated';
  ELSE
    RAISE EXCEPTION 'Failed to update RLS policy';
  END IF;
END $$;
