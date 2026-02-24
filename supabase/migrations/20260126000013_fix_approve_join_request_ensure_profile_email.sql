-- Fix approve_join_request to ensure user has profile with email before creating membership
-- This prevents "Cannot add user to organization: user has no email address" errors

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
  v_user_email text;
  v_profile_exists boolean;
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

  -- Get user's email from auth.users
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_request.user_id;

  IF v_user_email IS NULL OR TRIM(v_user_email) = '' THEN
    RETURN QUERY SELECT
      false,
      'Cannot add user to organization: user has no email address'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Ensure user has a profile with email
  -- Check if profile exists
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_request.user_id
  ) INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    -- Create profile if it doesn't exist
    -- Use user_profile from join request if available, otherwise use auth metadata
    INSERT INTO profiles (
      id,
      email,
      first_name,
      last_name,
      profile_status
    )
    SELECT
      v_request.user_id,
      v_user_email,
      COALESCE(
        (v_request.user_profile->>'first_name')::text,
        au.raw_user_meta_data->>'first_name',
        SPLIT_PART(v_user_email, '@', 1)
      ),
      COALESCE(
        (v_request.user_profile->>'last_name')::text,
        au.raw_user_meta_data->>'last_name',
        ''
      ),
      'active'
    FROM auth.users au
    WHERE au.id = v_request.user_id
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- Update existing profile to ensure email is set
    UPDATE profiles
    SET
      email = COALESCE(NULLIF(TRIM(email), ''), v_user_email),
      first_name = COALESCE(
        NULLIF(TRIM(first_name), ''),
        (v_request.user_profile->>'first_name')::text,
        (SELECT raw_user_meta_data->>'first_name' FROM auth.users WHERE id = v_request.user_id),
        SPLIT_PART(v_user_email, '@', 1)
      ),
      last_name = COALESCE(
        NULLIF(TRIM(last_name), ''),
        (v_request.user_profile->>'last_name')::text,
        (SELECT raw_user_meta_data->>'last_name' FROM auth.users WHERE id = v_request.user_id),
        ''
      ),
      updated_at = NOW()
    WHERE id = v_request.user_id
      AND (email IS NULL OR TRIM(email) = '' OR first_name IS NULL OR TRIM(first_name) = '');
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

COMMENT ON FUNCTION "public"."approve_join_request"(p_request_id uuid) IS 'Approves a join request and creates organization membership. Ensures user profile has email before creating membership.';
