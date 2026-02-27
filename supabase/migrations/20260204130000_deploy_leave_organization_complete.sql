-- Combined Migration: Deploy leave organization feature
-- This migration is idempotent and can be safely applied multiple times
-- It includes both the RPC function and RLS policy

-- ============================================================================
-- Part 1: Create/Update user_leave_organization RPC function
-- ============================================================================

-- Drop existing function if it exists (to allow updates)
DROP FUNCTION IF EXISTS public.user_leave_organization(uuid) CASCADE;

-- Create the RPC function
CREATE OR REPLACE FUNCTION public.user_leave_organization(
  p_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_result json;
BEGIN
  -- Get authenticated user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Check if user is a member of this organization
  SELECT role INTO v_user_role
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = v_user_id
    AND member_status = 'active';

  IF v_user_role IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are not a member of this organization'
    );
  END IF;

  -- Owners cannot leave - must transfer ownership first
  IF v_user_role = 'owner' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Organization owners must transfer ownership before leaving. Please promote another member to owner and try again.'
    );
  END IF;

  -- Soft delete: Mark membership as removed
  UPDATE organization_memberships
  SET
    member_status = 'removed',
    removed_at = NOW(),
    removed_by = v_user_id,
    updated_at = NOW()
  WHERE org_id = p_org_id
    AND user_id = v_user_id;

  -- Set redirect flag on user's profile
  UPDATE profiles
  SET redirect_to_onboarding = true
  WHERE id = v_user_id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'orgId', p_org_id,
    'userId', v_user_id,
    'removedAt', NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_leave_organization(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.user_leave_organization IS 'Allows authenticated users to leave an organization safely';

-- ============================================================================
-- Part 2: Create RLS policy to allow users to leave
-- ============================================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "users_can_leave_organization" ON public.organization_memberships;

-- Create the policy
DO $$ BEGIN
  CREATE POLICY "users_can_leave_organization" ON "public"."organization_memberships"
  FOR UPDATE
  USING (("auth"."uid"() = "user_id"))
  WITH CHECK (("auth"."uid"() = "user_id"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add comment for documentation
COMMENT ON POLICY "users_can_leave_organization" ON "public"."organization_memberships"
IS 'Allows authenticated users to update their own membership record to leave an organization';

-- ============================================================================
-- End of leave organization deployment
-- ============================================================================
