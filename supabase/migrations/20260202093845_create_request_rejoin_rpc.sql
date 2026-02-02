-- Migration: Create request_rejoin RPC function
-- Purpose: Allow removed users to request to rejoin organizations
-- Story: ORGREM-005

CREATE OR REPLACE FUNCTION public.request_rejoin(
  p_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_member_status text;
  v_existing_request_id uuid;
  v_new_request_id uuid;
BEGIN
  -- Get caller's user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Check if user has a removed membership in this org
  SELECT member_status INTO v_member_status
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = v_user_id;

  IF v_member_status IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You were never a member of this organization'
    );
  END IF;

  IF v_member_status = 'active' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are already an active member of this organization'
    );
  END IF;

  IF v_member_status != 'removed' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid membership status'
    );
  END IF;

  -- Check for existing pending request
  SELECT id INTO v_existing_request_id
  FROM rejoin_requests
  WHERE org_id = p_org_id
    AND user_id = v_user_id
    AND status = 'pending';

  IF v_existing_request_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You already have a pending rejoin request for this organization',
      'requestId', v_existing_request_id
    );
  END IF;

  -- Create new rejoin request
  INSERT INTO rejoin_requests (org_id, user_id, status, requested_at)
  VALUES (p_org_id, v_user_id, 'pending', NOW())
  RETURNING id INTO v_new_request_id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'requestId', v_new_request_id,
    'orgId', p_org_id,
    'userId', v_user_id,
    'status', 'pending'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You already have a pending rejoin request for this organization'
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.request_rejoin(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.request_rejoin IS 'Allows removed users to request to rejoin an organization';
