-- ONBOARD-009: Update accept_join_request RPC with timeout protection
-- Adds 5-minute timeout to atomic processing check

CREATE OR REPLACE FUNCTION accept_join_request(
  request_id uuid,
  approval_token text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_record organization_join_requests;
  org_record organizations;
  result json;
BEGIN
  -- 1. Atomically check and set processing flag
  -- Also allows claiming requests stuck in processing for >5 minutes (timeout protection)
  UPDATE organization_join_requests
  SET is_processing = true,
      processing_started_at = NOW()
  WHERE id = request_id
    AND status = 'pending'
    AND (
      is_processing = false
      OR processing_started_at < NOW() - INTERVAL '5 minutes'
    )
  RETURNING * INTO request_record;

  -- If no row returned, request is already being processed or doesn't exist
  IF request_record.id IS NULL THEN
    -- Check if it's being processed or completed
    SELECT * INTO request_record
    FROM organization_join_requests
    WHERE id = request_id;

    IF request_record.id IS NULL THEN
      RAISE EXCEPTION 'Join request not found';
    END IF;

    IF request_record.is_processing THEN
      RAISE EXCEPTION 'Request is already being processed by another operation';
    END IF;

    IF request_record.status = 'approved' THEN
      RAISE EXCEPTION 'Request has already been approved';
    END IF;

    IF request_record.status = 'rejected' THEN
      RAISE EXCEPTION 'Request was rejected';
    END IF;

    RAISE EXCEPTION 'Request is not in pending status';
  END IF;

  -- 2. Verify approval token if provided
  IF approval_token IS NOT NULL AND request_record.approval_token != approval_token THEN
    -- Reset processing flag before raising error
    UPDATE organization_join_requests
    SET is_processing = false, processing_started_at = NULL
    WHERE id = request_id;

    RAISE EXCEPTION 'Invalid approval token';
  END IF;

  -- 3. Get organization details
  SELECT * INTO org_record
  FROM organizations
  WHERE id = request_record.organization_id;

  IF org_record.id IS NULL THEN
    -- Reset processing flag
    UPDATE organization_join_requests
    SET is_processing = false, processing_started_at = NULL
    WHERE id = request_id;

    RAISE EXCEPTION 'Organization not found';
  END IF;

  BEGIN
    -- 4. Create organization membership
    INSERT INTO organization_memberships (
      organization_id,
      user_id,
      role
    ) VALUES (
      request_record.organization_id,
      request_record.user_id,
      'member'
    )
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    -- 5. Update join request status
    UPDATE organization_join_requests
    SET status = 'approved',
        approved_at = NOW(),
        is_processing = false,
        processing_started_at = NULL
    WHERE id = request_id;

    -- 6. Update user profile status if needed
    UPDATE profiles
    SET status = 'active'
    WHERE id = request_record.user_id
      AND status = 'pending_approval';

    -- Return success
    result := json_build_object(
      'success', true,
      'organization_id', request_record.organization_id,
      'organization_name', org_record.name,
      'user_id', request_record.user_id
    );

    RETURN result;

  EXCEPTION WHEN OTHERS THEN
    -- Reset processing flag on any error
    UPDATE organization_join_requests
    SET is_processing = false,
        processing_started_at = NULL
    WHERE id = request_id;

    RAISE;
  END;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION accept_join_request TO authenticated;

-- Update comment to reflect timeout protection
COMMENT ON FUNCTION accept_join_request IS 'Atomically accepts a join request with race condition protection via is_processing flag. Includes 5-minute timeout protection.';
