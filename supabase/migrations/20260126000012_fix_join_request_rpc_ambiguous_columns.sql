-- Fix ambiguous column references in join request RPC functions
-- The issue: RETURNS TABLE has columns org_id/user_id that conflict with table column names
-- Solution: Qualify all column references with table aliases

-- Fix approve_join_request
CREATE OR REPLACE FUNCTION "public"."approve_join_request"(
  p_request_id uuid
)
RETURNS TABLE (
  success boolean,
  message text,
  org_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
BEGIN
  -- Get the request
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

  -- Verify caller is admin of the org
  -- FIX: Qualify column names with table alias to avoid ambiguity
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only org admins can approve requests'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Check if user is already a member (edge case)
  -- FIX: Qualify column names with table alias
  IF EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = v_request.user_id
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
  )
  VALUES (
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
    'Join request approved successfully'::text,
    v_request.org_id,
    v_request.user_id;
END;
$$;

-- Fix reject_join_request
CREATE OR REPLACE FUNCTION "public"."reject_join_request"(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
BEGIN
  -- Get the request
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

  -- Verify caller is admin of the org
  -- FIX: Qualify column names with table alias to avoid ambiguity
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only org admins can reject requests'::text;
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
