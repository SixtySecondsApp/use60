-- Migration: Create user_leave_organization RPC function
-- Purpose: Allow users to safely leave organizations with atomic updates
-- Story: ORG-LEAVE-001

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
