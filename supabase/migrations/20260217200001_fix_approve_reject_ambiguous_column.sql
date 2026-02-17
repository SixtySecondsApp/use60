-- Fix: "column reference org_id is ambiguous" in approve/reject join request functions
-- Problem: RETURNS TABLE columns (org_id, user_id) conflict with same-named table columns
-- Solution: Table-qualify all column references in WHERE clauses

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
AS $function$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
  -- Get the join request
  SELECT * INTO v_request
  FROM organization_join_requests ojr
  WHERE ojr.id = p_request_id
  AND ojr.status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Verify caller is ACTIVE admin of the org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
    AND om.member_status = 'active'
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only active org admins can approve requests'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Check if user is already an ACTIVE member
  IF EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = v_request.user_id
    AND om.member_status = 'active'
  ) THEN
    -- Update request status but don't create duplicate membership
    UPDATE organization_join_requests
    SET status = 'approved',
        actioned_by = auth.uid(),
        actioned_at = NOW()
    WHERE id = p_request_id;

    RETURN QUERY SELECT
      true,
      'User is already an active member'::text,
      v_request.org_id,
      v_request.user_id;
    RETURN;
  END IF;

  -- If user has a removed membership, reactivate it
  IF EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = v_request.user_id
    AND om.member_status = 'removed'
  ) THEN
    UPDATE organization_memberships om
    SET member_status = 'active',
        removed_at = NULL,
        removed_by = NULL
    WHERE om.org_id = v_request.org_id
    AND om.user_id = v_request.user_id;
  ELSE
    -- Create new membership (trigger will ensure member_status='active')
    INSERT INTO organization_memberships (
      org_id,
      user_id,
      role,
      member_status
    ) VALUES (
      v_request.org_id,
      v_request.user_id,
      'member',
      'active'
    );
  END IF;

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
$function$;

-- Also fix reject_join_request for consistency (no org_id in RETURNS but has user_id-like refs)
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
AS $function$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
  -- Get the join request
  SELECT * INTO v_request
  FROM organization_join_requests ojr
  WHERE ojr.id = p_request_id
  AND ojr.status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text;
    RETURN;
  END IF;

  -- Verify caller is ACTIVE admin of the org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_request.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
    AND om.member_status = 'active'
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
$function$;
