-- Migration: Allow users to update their own membership to leave organization
-- Purpose: Fix RLS policy to allow members to set member_status = 'removed' when leaving
-- Story: ORG-LEAVE-002

-- Add a specific policy allowing authenticated users to update their own membership
-- when changing member_status to 'removed' (leaving the organization)
DO $$ BEGIN
  CREATE POLICY "users_can_leave_organization" ON "public"."organization_memberships"
  FOR UPDATE
  USING (
    -- Allow if:
    -- 1. User is updating their own record AND
    -- 2. Only setting member_status to 'removed' (leaving the org)
    ("auth"."uid"() = "user_id")
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
    ("auth"."uid"() = "user_id")
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Comment for documentation
COMMENT ON POLICY "users_can_leave_organization" ON "public"."organization_memberships"
IS 'Allows authenticated users to update their own membership record to leave an organization';
