-- Ensure citext extension exists
CREATE EXTENSION IF NOT EXISTS citext;

-- Create organization_join_requests table
CREATE TABLE "public"."organization_join_requests" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "email" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_at" timestamptz DEFAULT now() NOT NULL,
  "actioned_by" uuid REFERENCES auth.users(id),
  "actioned_at" timestamptz,
  "rejection_reason" text,
  "user_profile" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),

  CONSTRAINT "organization_join_requests_status_check"
    CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected']))
);

-- Indexes for performance
CREATE UNIQUE INDEX idx_join_requests_unique_pending
  ON organization_join_requests(org_id, user_id)
  WHERE status = 'pending';

CREATE INDEX idx_join_requests_org_pending
  ON organization_join_requests(org_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_join_requests_user
  ON organization_join_requests(user_id);

-- Enable RLS
ALTER TABLE "public"."organization_join_requests" ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can view their own join requests
CREATE POLICY "users_view_own_join_requests"
  ON organization_join_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy 2: Org admins can view requests for their org
CREATE POLICY "org_admins_view_join_requests"
  ON organization_join_requests
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 3: Users can create join requests (INSERT handled by RPC)
CREATE POLICY "users_create_join_requests"
  ON organization_join_requests
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy 4: Org admins can update (approve/reject) requests
CREATE POLICY "org_admins_update_join_requests"
  ON organization_join_requests
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- RPC Function: create_join_request
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
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

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

-- RPC Function: approve_join_request
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
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only org admins can approve requests'::text,
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

-- RPC Function: reject_join_request
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
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
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
