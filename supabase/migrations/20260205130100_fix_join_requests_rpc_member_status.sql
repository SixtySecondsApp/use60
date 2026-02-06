-- Add member_status check to approve_join_request and reject_join_request RPC functions
--
-- Bug: The RPC functions check if user is admin/owner but don't verify member_status = 'active'
-- This allows removed admins to potentially approve/reject requests if they bypass SELECT policy
--
-- Fix: Add member_status = 'active' check to authorization logic in both functions

-- Drop and recreate approve_join_request with member_status check
DROP FUNCTION IF EXISTS approve_join_request(uuid, uuid);

CREATE OR REPLACE FUNCTION approve_join_request(
  p_request_id uuid,
  p_actioned_by_user_id uuid
)
RETURNS TABLE (
  success boolean,
  message text,
  org_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
  -- Get the join request
  SELECT * INTO v_request
  FROM organization_join_requests
  WHERE id = p_request_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Verify caller is ACTIVE admin of the org (FIXED: added member_status check)
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'  -- CRITICAL FIX: Only active admins can approve
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only active org admins can approve requests'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Check if user is already a member (edge case)
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id
  ) THEN
    -- Update request status but don't create duplicate membership
    UPDATE organization_join_requests
    SET status = 'approved',
        actioned_by = auth.uid(),
        actioned_at = NOW()
    WHERE id = p_request_id;

    RETURN QUERY SELECT
      true,
      'User is already a member'::text,
      v_request.org_id,
      v_request.user_id;
    RETURN;
  END IF;

  -- Create membership
  INSERT INTO organization_memberships (
    org_id,
    user_id,
    role
  ) VALUES (
    v_request.org_id,
    v_request.user_id,
    'member'
  );

  -- Update request status
  UPDATE organization_join_requests
  SET status = 'approved',
      actioned_by = auth.uid(),
      actioned_at = NOW()
  WHERE id = p_request_id;

  RETURN QUERY SELECT
    true,
    'Join request approved'::text,
    v_request.org_id,
    v_request.user_id;
END;
$$;

-- Drop and recreate reject_join_request with member_status check
DROP FUNCTION IF EXISTS reject_join_request(uuid, uuid, text);

CREATE OR REPLACE FUNCTION reject_join_request(
  p_request_id uuid,
  p_actioned_by_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
  -- Get the join request
  SELECT * INTO v_request
  FROM organization_join_requests
  WHERE id = p_request_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text;
    RETURN;
  END IF;

  -- Verify caller is ACTIVE admin of the org (FIXED: added member_status check)
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'  -- CRITICAL FIX: Only active admins can reject
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only active org admins can reject requests'::text;
    RETURN;
  END IF;

  -- Update request status
  UPDATE organization_join_requests
  SET status = 'rejected',
      actioned_by = auth.uid(),
      actioned_at = NOW(),
      rejection_reason = p_reason
  WHERE id = p_request_id;

  RETURN QUERY SELECT
    true,
    'Join request rejected'::text;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION approve_join_request IS
  'Approve a join request and create membership. Only active organization owners and admins can approve.';

COMMENT ON FUNCTION reject_join_request IS
  'Reject a join request. Only active organization owners and admins can reject.';
