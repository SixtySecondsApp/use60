-- Migration: Update cancel_join_request RPC to handle rejoin_requests
-- Purpose: Allow users to cancel rejoin requests after they've left an organization
-- Story: REJOIN-005

CREATE OR REPLACE FUNCTION "public"."cancel_join_request"(
  p_request_id uuid,
  p_user_id uuid
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
  v_request_type text := 'unknown';
BEGIN
  -- First check organization_join_requests
  SELECT * INTO v_request
  FROM organization_join_requests
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND status = 'pending';

  IF FOUND THEN
    v_request_type := 'join_request';
  ELSE
    -- Check rejoin_requests if not found in join_requests
    SELECT * INTO v_request
    FROM rejoin_requests
    WHERE id = p_request_id
      AND user_id = p_user_id
      AND status = 'pending';

    IF FOUND THEN
      v_request_type := 'rejoin_request';
    END IF;
  END IF;

  -- If request not found in either table, return error
  IF v_request_type = 'unknown' THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text;
    RETURN;
  END IF;

  -- Delete the appropriate request type
  IF v_request_type = 'join_request' THEN
    DELETE FROM organization_join_requests
    WHERE id = p_request_id;
  ELSIF v_request_type = 'rejoin_request' THEN
    DELETE FROM rejoin_requests
    WHERE id = p_request_id;
  END IF;

  -- Reset profile status to active (so they can try another organization)
  UPDATE profiles
  SET profile_status = 'active'
  WHERE id = p_user_id;

  -- Reset onboarding progress to allow restart
  UPDATE user_onboarding_progress
  SET
    onboarding_step = 'website_input',
    onboarding_completed_at = NULL
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT
    true,
    'Join request cancelled successfully'::text;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cancel_join_request(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION "public"."cancel_join_request"(uuid, uuid) IS 'Cancels a pending join or rejoin request. Allows users to restart onboarding. Handles both organization_join_requests and rejoin_requests tables.';
