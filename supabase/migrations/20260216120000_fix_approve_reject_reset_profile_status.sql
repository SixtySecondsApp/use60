-- Fix: approve_join_request and reject_join_request must reset profile_status
--
-- Bug: When admin approves a join request, the user's profile_status remains
-- 'pending_approval' (set during onboarding). This causes ProtectedRoute to
-- redirect the user to /auth/pending-approval even though they're now a member.
--
-- Fix:
-- 1. approve_join_request → set profile_status = 'active'
-- 2. reject_join_request → set profile_status = 'rejected'

-- Step 1: Update approve_join_request to reset profile_status
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

  -- Verify caller is ACTIVE admin of the org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'
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
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id
    AND member_status = 'active'
  ) THEN
    -- Update request status but don't create duplicate membership
    UPDATE organization_join_requests
    SET status = 'approved',
        actioned_by = auth.uid(),
        actioned_at = NOW()
    WHERE id = p_request_id;

    -- Still reset profile_status so user isn't trapped on pending-approval page
    UPDATE profiles
    SET profile_status = 'active'
    WHERE id = v_request.user_id
    AND profile_status = 'pending_approval';

    RETURN QUERY SELECT
      true,
      'User is already an active member'::text,
      v_request.org_id,
      v_request.user_id;
    RETURN;
  END IF;

  -- If user has a removed membership, reactivate it
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id
    AND member_status = 'removed'
  ) THEN
    UPDATE organization_memberships
    SET member_status = 'active',
        removed_at = NULL,
        removed_by = NULL
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id;
  ELSE
    -- Create new membership with explicit member_status='active'
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

  -- CRITICAL FIX: Reset profile_status from 'pending_approval' to 'active'
  -- Without this, ProtectedRoute redirects approved users to /auth/pending-approval
  UPDATE profiles
  SET profile_status = 'active'
  WHERE id = v_request.user_id
  AND profile_status = 'pending_approval';

  RETURN QUERY SELECT
    true,
    'Join request approved'::text,
    v_request.org_id,
    v_request.user_id;
END;
$function$;

-- Step 2: Update reject_join_request to set profile_status = 'rejected'
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
  FROM organization_join_requests
  WHERE id = p_request_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text;
    RETURN;
  END IF;

  -- Verify caller is ACTIVE admin of the org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'
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

  -- CRITICAL FIX: Reset profile_status so rejected user isn't stuck on pending-approval
  -- Set to 'rejected' so ProtectedRoute can show appropriate rejection message
  UPDATE profiles
  SET profile_status = 'rejected'
  WHERE id = v_request.user_id
  AND profile_status = 'pending_approval';

  RETURN QUERY SELECT
    true,
    'Join request rejected'::text;
END;
$function$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Fixed approve_join_request: now resets profile_status to active';
  RAISE NOTICE 'Fixed reject_join_request: now resets profile_status to rejected';
END $$;
