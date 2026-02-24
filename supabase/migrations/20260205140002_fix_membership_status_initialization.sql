-- Fix: Organization Membership Status Initialization Bug
-- Problem: User creates org during onboarding, later gets "already a member" error
--          but org appears empty in admin because member_status is NULL/inactive
--
-- Root Causes:
-- 1. Membership insertion doesn't explicitly set member_status='active'
-- 2. Member count only counts active members, but already-member check doesn't filter
-- 3. Concurrent operations can leave phantom memberships
--
-- Fixes:
-- 1. Ensure all existing NULL member_status values are set to 'active'
-- 2. Create trigger to guarantee member_status='active' on insert
-- 3. Update create_join_request to check member_status consistently
-- 4. Fix approve_join_request to explicitly set member_status='active'

-- Step 1: Fix all existing NULL member_status values
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE organization_memberships
  SET member_status = 'active'
  WHERE member_status IS NULL
    OR member_status NOT IN ('active', 'removed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ Fixed % memberships with NULL or invalid member_status', v_count;
END $$;

-- Step 2: Add trigger to guarantee member_status='active' on insert (if not specified)
-- First, drop existing trigger if it exists
DROP TRIGGER IF EXISTS ensure_member_status_on_insert ON organization_memberships;
DROP FUNCTION IF EXISTS ensure_member_status_on_insert();

CREATE FUNCTION ensure_member_status_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure member_status is always set to 'active' if not provided
  IF NEW.member_status IS NULL THEN
    NEW.member_status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_member_status_on_insert
BEFORE INSERT ON organization_memberships
FOR EACH ROW
EXECUTE FUNCTION ensure_member_status_on_insert();

-- Step 3: Update create_join_request to consistently check member_status
-- The "already a member" check should only count active members
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

  -- Check if user is already an ACTIVE member (CRITICAL FIX: added member_status filter)
  -- This prevents "already a member" error when user has phantom/removed membership
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = p_org_id
      AND user_id = p_user_id
      AND member_status = 'active'
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

  -- If user has a removed membership, allow re-joining via request
  -- (This is handled by the rejoin flow, not here)

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

-- Step 4: Update approve_join_request to explicitly set member_status='active'
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
$$;

-- Step 5: Ensure reject_join_request also checks member_status correctly
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

  RETURN QUERY SELECT
    true,
    'Join request rejected'::text;
END;
$$;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed member_status initialization:';
  RAISE NOTICE '  ✓ All NULL member_status values set to active';
  RAISE NOTICE '  ✓ Trigger added to enforce member_status=active on insert';
  RAISE NOTICE '  ✓ create_join_request now filters by member_status correctly';
  RAISE NOTICE '  ✓ approve_join_request explicitly sets member_status=active';
  RAISE NOTICE '  ✓ reject_join_request checks member_status correctly';
END $$;
