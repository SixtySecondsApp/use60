-- Migration: Add rejoin invitations tracking for auto-accept
-- Feature: When admin sends rejoin invitation, user's rejoin request should auto-approve
-- Current: Admin sends email but no DB record, user must still wait for manual approval

-- Create table to track admin-sent rejoin invitations
CREATE TABLE IF NOT EXISTS public.rejoin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL DEFAULT (NOW() + interval '30 days'),
  status text NOT NULL CHECK (status IN ('active', 'used', 'expired')) DEFAULT 'active',
  used_at timestamptz,
  created_at timestamptz DEFAULT NOW()
);

-- Create unique index to prevent duplicate active invitations
CREATE UNIQUE INDEX idx_rejoin_invitations_unique_active
ON public.rejoin_invitations(org_id, user_id)
WHERE status = 'active';

-- Create index for querying by organization
CREATE INDEX idx_rejoin_invitations_org_id
ON public.rejoin_invitations(org_id, status);

-- Create index for querying by user
CREATE INDEX idx_rejoin_invitations_user_id
ON public.rejoin_invitations(user_id, status);

-- Enable RLS
ALTER TABLE public.rejoin_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own invitations
CREATE POLICY "Users can view own rejoin invitations"
ON public.rejoin_invitations
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Org admins can view all invitations for their org
CREATE POLICY "Org admins can view org rejoin invitations"
ON public.rejoin_invitations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE org_id = rejoin_invitations.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
  )
);

-- RLS Policy: Org admins can insert rejoin invitations
CREATE POLICY "Org admins can create rejoin invitations"
ON public.rejoin_invitations
FOR INSERT
WITH CHECK (
  auth.uid() = invited_by
  AND EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE org_id = rejoin_invitations.org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
  )
);

-- Add comment
COMMENT ON TABLE public.rejoin_invitations IS 'Tracks admin-sent rejoin invitations for auto-approval';

-- ============================================================================
-- Update request_rejoin RPC to check for existing invitation and auto-approve
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_rejoin(
  p_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_member_status text;
  v_existing_request_id uuid;
  v_new_request_id uuid;
  v_existing_invitation_id uuid;
  v_invitation_expired boolean;
BEGIN
  -- Get caller's user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Check if user has a removed membership in this org
  SELECT member_status INTO v_member_status
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = v_user_id;

  IF v_member_status IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You were never a member of this organization'
    );
  END IF;

  IF v_member_status = 'active' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are already an active member of this organization'
    );
  END IF;

  IF v_member_status != 'removed' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid membership status'
    );
  END IF;

  -- Check for existing active invitation from admin
  SELECT
    id,
    (expires_at < NOW()) as is_expired
  INTO
    v_existing_invitation_id,
    v_invitation_expired
  FROM rejoin_invitations
  WHERE org_id = p_org_id
    AND user_id = v_user_id
    AND status = 'active';

  -- If admin already sent invitation and it's not expired, auto-approve
  IF v_existing_invitation_id IS NOT NULL AND NOT v_invitation_expired THEN
    -- Mark invitation as used
    UPDATE rejoin_invitations
    SET
      status = 'used',
      used_at = NOW()
    WHERE id = v_existing_invitation_id;

    -- Reactivate membership directly (no request needed)
    UPDATE organization_memberships
    SET
      member_status = 'active',
      removed_at = NULL,
      removed_by = NULL,
      removal_reason = NULL
    WHERE org_id = p_org_id
      AND user_id = v_user_id;

    -- Update profile status to active
    UPDATE profiles
    SET profile_status = 'active'
    WHERE id = v_user_id;

    RETURN json_build_object(
      'success', true,
      'auto_approved', true,
      'message', 'Welcome back! Your admin already invited you to rejoin.',
      'orgId', p_org_id,
      'userId', v_user_id
    );
  END IF;

  -- No invitation or expired - proceed with normal request flow
  IF v_existing_invitation_id IS NOT NULL AND v_invitation_expired THEN
    -- Mark expired invitation
    UPDATE rejoin_invitations
    SET status = 'expired'
    WHERE id = v_existing_invitation_id;
  END IF;

  -- Check for existing pending request
  SELECT id INTO v_existing_request_id
  FROM rejoin_requests
  WHERE org_id = p_org_id
    AND user_id = v_user_id
    AND status = 'pending';

  IF v_existing_request_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You already have a pending rejoin request for this organization',
      'requestId', v_existing_request_id
    );
  END IF;

  -- Create new rejoin request
  INSERT INTO rejoin_requests (org_id, user_id, status, requested_at)
  VALUES (p_org_id, v_user_id, 'pending', NOW())
  RETURNING id INTO v_new_request_id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'auto_approved', false,
    'requestId', v_new_request_id,
    'orgId', p_org_id,
    'userId', v_user_id,
    'status', 'pending',
    'message', 'Rejoin request submitted. An admin will review your request.'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You already have a pending rejoin request for this organization'
    );
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.request_rejoin IS 'Allows removed users to request to rejoin. Auto-approves if admin already sent invitation.';

-- ============================================================================
-- Add RPC function for admins to record rejoin invitation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_rejoin_invitation(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_new_invitation_id uuid;
  v_member_status text;
BEGIN
  -- Get caller's user ID
  v_admin_id := auth.uid();

  IF v_admin_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Verify caller is admin/owner of the organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = p_org_id
      AND user_id = v_admin_id
      AND role IN ('owner', 'admin')
      AND member_status = 'active'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You do not have permission to send rejoin invitations for this organization'
    );
  END IF;

  -- Verify target user has removed status
  SELECT member_status INTO v_member_status
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = p_user_id;

  IF v_member_status IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User was never a member of this organization'
    );
  END IF;

  IF v_member_status = 'active' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User is already an active member'
    );
  END IF;

  IF v_member_status != 'removed' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot send invitation - invalid member status'
    );
  END IF;

  -- Invalidate any existing active invitation (replace with new one)
  UPDATE rejoin_invitations
  SET status = 'expired'
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND status = 'active';

  -- Create new invitation record
  INSERT INTO rejoin_invitations (org_id, user_id, invited_by)
  VALUES (p_org_id, p_user_id, v_admin_id)
  RETURNING id INTO v_new_invitation_id;

  RETURN json_build_object(
    'success', true,
    'invitationId', v_new_invitation_id,
    'expiresAt', (NOW() + interval '30 days')::text
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.record_rejoin_invitation(uuid, uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.record_rejoin_invitation IS 'Records that an admin sent a rejoin invitation. Enables auto-approval when user requests to rejoin.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Created rejoin_invitations table for auto-accept tracking';
  RAISE NOTICE '✅ Updated request_rejoin to auto-approve if invitation exists';
  RAISE NOTICE '✅ Created record_rejoin_invitation RPC for admins';
END $$;
