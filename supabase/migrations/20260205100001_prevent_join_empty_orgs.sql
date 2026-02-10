-- Migration: Prevent join requests to empty organizations
-- Problem: Edge case where users could submit join requests to orgs with 0 members
-- Solution: Add validation to create_join_request RPC to reject empty orgs

-- Update create_join_request to validate org has active members
CREATE OR REPLACE FUNCTION "public"."create_join_request"(
  p_org_id uuid,
  p_user_id uuid,
  p_user_profile jsonb DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  join_request_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_join_request_id uuid;
  v_user_email text;
  v_member_count bigint;
  v_org_name text;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  -- Get org name and member count
  SELECT
    o.name,
    COUNT(om.user_id)
  INTO v_org_name, v_member_count
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
    AND om.member_status = 'active'
  WHERE o.id = p_org_id
  GROUP BY o.id, o.name;

  -- Check if organization exists
  IF v_org_name IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::uuid,
      'Organization not found'::text;
    RETURN;
  END IF;

  -- Check if organization has active members (critical validation)
  IF v_member_count = 0 THEN
    RETURN QUERY SELECT
      false,
      NULL::uuid,
      'This organization is inactive and cannot accept new members. Please create a new organization instead.'::text;
    RETURN;
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = p_org_id AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT
      false,
      NULL::uuid,
      'You are already a member of this organization'::text;
    RETURN;
  END IF;

  -- Check if pending request already exists
  IF EXISTS (
    SELECT 1 FROM organization_join_requests
    WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND status = 'pending'
  ) THEN
    RETURN QUERY SELECT
      false,
      NULL::uuid,
      'You already have a pending request for this organization'::text;
    RETURN;
  END IF;

  -- Create join request
  INSERT INTO organization_join_requests (
    org_id,
    user_id,
    email,
    status,
    user_profile
  )
  VALUES (
    p_org_id,
    p_user_id,
    v_user_email,
    'pending',
    p_user_profile
  )
  RETURNING id INTO v_join_request_id;

  RETURN QUERY SELECT
    true,
    v_join_request_id,
    'Join request created successfully'::text;
END;
$$;

-- Add comment
COMMENT ON FUNCTION "public"."create_join_request"(uuid, uuid, jsonb) IS
'Creates a join request for a user to join an organization.
Validates that:
1. Organization exists and has active members (prevents joining "ghost" orgs)
2. User is not already a member
3. No duplicate pending requests exist';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Updated create_join_request to prevent joining empty organizations';
END $$;
