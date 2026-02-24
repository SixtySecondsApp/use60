-- Migration: Add cancel_join_request RPC function
-- Allows users to cancel their pending join requests and restart onboarding

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
BEGIN
  -- Get the pending request
  SELECT * INTO v_request
  FROM organization_join_requests
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text;
    RETURN;
  END IF;

  -- Delete the join request
  DELETE FROM organization_join_requests
  WHERE id = p_request_id;

  -- Reset profile status to active (so they can create new org)
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
