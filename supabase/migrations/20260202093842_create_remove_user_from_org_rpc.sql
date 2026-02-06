-- Migration: Create remove_user_from_org RPC function
-- Purpose: Safely remove users from organizations with validation
-- Story: ORGREM-003

CREATE OR REPLACE FUNCTION public.remove_user_from_org(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_owner_count integer;
  v_result json;
BEGIN
  -- Get caller's user ID
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Check if caller is admin/owner of the organization
  SELECT role INTO v_caller_role
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = v_caller_id
    AND member_status = 'active';

  IF v_caller_role IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User is not a member of this organization'
    );
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only organization owners and admins can remove users'
    );
  END IF;

  -- Prevent self-removal
  IF v_caller_id = p_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You cannot remove yourself from the organization'
    );
  END IF;

  -- Get target user's role
  SELECT role INTO v_target_role
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND member_status = 'active';

  IF v_target_role IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User is not an active member of this organization'
    );
  END IF;

  -- Check if target is the last owner
  IF v_target_role = 'owner' THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM organization_memberships
    WHERE org_id = p_org_id
      AND role = 'owner'
      AND member_status = 'active';

    IF v_owner_count <= 1 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot remove the last owner of the organization'
      );
    END IF;
  END IF;

  -- Soft delete: Update member_status to 'removed'
  UPDATE organization_memberships
  SET
    member_status = 'removed',
    removed_at = NOW(),
    removed_by = v_caller_id,
    updated_at = NOW()
  WHERE org_id = p_org_id
    AND user_id = p_user_id;

  -- Set redirect flag on user's profile
  UPDATE profiles
  SET redirect_to_onboarding = true
  WHERE id = p_user_id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'userId', p_user_id,
    'orgId', p_org_id,
    'removedBy', v_caller_id,
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
GRANT EXECUTE ON FUNCTION public.remove_user_from_org(uuid, uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.remove_user_from_org IS 'Safely removes a user from an organization with validation checks';
