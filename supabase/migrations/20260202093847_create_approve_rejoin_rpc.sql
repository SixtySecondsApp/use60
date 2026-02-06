-- Migration: Create approve_rejoin_request RPC function
-- Purpose: Allow admins to approve rejoin requests
-- Story: ORGREM-006

CREATE OR REPLACE FUNCTION public.approve_rejoin_request(
  p_request_id uuid,
  p_approved boolean,
  p_rejection_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_admin_role text;
  v_request_org_id uuid;
  v_request_user_id uuid;
  v_request_status text;
BEGIN
  -- Get caller's user ID
  v_admin_id := auth.uid();

  IF v_admin_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Get request details
  SELECT org_id, user_id, status
  INTO v_request_org_id, v_request_user_id, v_request_status
  FROM rejoin_requests
  WHERE id = p_request_id;

  IF v_request_org_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Rejoin request not found'
    );
  END IF;

  IF v_request_status != 'pending' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request has already been processed',
      'currentStatus', v_request_status
    );
  END IF;

  -- Check if caller is admin/owner of the organization
  SELECT role INTO v_admin_role
  FROM organization_memberships
  WHERE org_id = v_request_org_id
    AND user_id = v_admin_id
    AND member_status = 'active';

  IF v_admin_role NOT IN ('owner', 'admin') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only organization owners and admins can approve rejoin requests'
    );
  END IF;

  -- Process approval
  IF p_approved THEN
    -- Update membership status back to active
    UPDATE organization_memberships
    SET
      member_status = 'active',
      removed_at = NULL,
      removed_by = NULL,
      updated_at = NOW()
    WHERE org_id = v_request_org_id
      AND user_id = v_request_user_id;

    -- Clear redirect flag
    UPDATE profiles
    SET redirect_to_onboarding = false
    WHERE id = v_request_user_id;

    -- Mark request as approved
    UPDATE rejoin_requests
    SET
      status = 'approved',
      actioned_by = v_admin_id,
      actioned_at = NOW(),
      updated_at = NOW()
    WHERE id = p_request_id;

    RETURN json_build_object(
      'success', true,
      'approved', true,
      'requestId', p_request_id,
      'userId', v_request_user_id,
      'orgId', v_request_org_id
    );

  ELSE
    -- Mark request as rejected
    UPDATE rejoin_requests
    SET
      status = 'rejected',
      actioned_by = v_admin_id,
      actioned_at = NOW(),
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
    WHERE id = p_request_id;

    RETURN json_build_object(
      'success', true,
      'approved', false,
      'requestId', p_request_id,
      'userId', v_request_user_id,
      'orgId', v_request_org_id,
      'reason', p_rejection_reason
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.approve_rejoin_request(uuid, boolean, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.approve_rejoin_request IS 'Allows org admins to approve or reject rejoin requests';
