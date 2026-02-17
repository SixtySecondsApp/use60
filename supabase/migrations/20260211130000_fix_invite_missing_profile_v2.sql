-- Fix: Ensure profile exists before creating organization membership
-- Issue: FK constraint "organization_memberships_profiles_fk" fails when profile doesn't exist
-- Root Cause: Trigger to auto-create profile may not run or fail silently
-- Solution: Both RPC functions now create profile if it doesn't exist (defensive programming)

-- =====================================================
-- Fix complete_invite_signup
-- =====================================================

CREATE OR REPLACE FUNCTION complete_invite_signup(p_token TEXT)
RETURNS TABLE(
  success BOOLEAN,
  org_id UUID,
  org_name TEXT,
  role TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invitation RECORD;
  v_user_id UUID;
  v_org_name TEXT;
  v_user_email TEXT;
BEGIN
  -- Find the invitation
  SELECT organization_invitations.id, organization_invitations.org_id, organization_invitations.email, organization_invitations.role, organization_invitations.token, organization_invitations.expires_at, organization_invitations.accepted_at
  INTO v_invitation
  FROM organization_invitations
  WHERE organization_invitations.token = p_token
    AND organization_invitations.accepted_at IS NULL
    AND organization_invitations.expires_at > NOW();

  IF v_invitation IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'Invalid, expired, or already used invitation'::TEXT;
    RETURN;
  END IF;

  -- Find the user by email (should have been created via signup)
  SELECT id, email INTO v_user_id, v_user_email
  FROM auth.users
  WHERE email = LOWER(v_invitation.email);

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'User account not found'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL FIX: Ensure profile exists before creating membership
  -- This handles cases where the trigger didn't run or failed
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      profile_status,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_user_email,
      'active',
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;

    RAISE LOG '[complete_invite_signup] Created missing profile for user: %', v_user_id;
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_memberships.org_id = v_invitation.org_id AND organization_memberships.user_id = v_user_id
  ) THEN
    SELECT name INTO v_org_name FROM organizations WHERE organizations.id = v_invitation.org_id;
    RETURN QUERY SELECT
      false,
      v_invitation.org_id,
      v_org_name,
      NULL::TEXT,
      'Already a member of this organization'::TEXT;
    RETURN;
  END IF;

  -- Create membership (now safe - profile guaranteed to exist)
  INSERT INTO organization_memberships (org_id, user_id, role)
  VALUES (v_invitation.org_id, v_user_id, v_invitation.role);

  -- Mark invitation as accepted
  UPDATE organization_invitations
  SET accepted_at = NOW()
  WHERE organization_invitations.id = v_invitation.id;

  -- Mark onboarding as complete for invited users
  INSERT INTO user_onboarding_progress (user_id, onboarding_step, onboarding_completed_at, skipped_onboarding)
  VALUES (v_user_id, 'complete', NOW(), false)
  ON CONFLICT (user_id) DO UPDATE SET
    onboarding_step = 'complete',
    onboarding_completed_at = NOW(),
    skipped_onboarding = false;

  -- Fetch organization name for successful response
  SELECT name INTO v_org_name FROM organizations WHERE organizations.id = v_invitation.org_id;

  RETURN QUERY SELECT
    true,
    v_invitation.org_id,
    v_org_name,
    v_invitation.role,
    NULL::TEXT;
END;
$function$;

-- =====================================================
-- Fix accept_org_invitation
-- =====================================================

CREATE OR REPLACE FUNCTION public.accept_org_invitation(p_token TEXT)
RETURNS TABLE(success BOOLEAN, org_id UUID, org_name TEXT, role TEXT, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invitation RECORD;
  v_user_email TEXT;
  v_user_id UUID;
BEGIN
  -- Get current user's email and ID
  SELECT au.email, au.id INTO v_user_email, v_user_id
  FROM auth.users au
  WHERE au.id = auth.uid();

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'Not authenticated'::TEXT;
    RETURN;
  END IF;

  -- Find the invitation
  SELECT i.*, o.name as org_name
  INTO v_invitation
  FROM organization_invitations i
  JOIN organizations o ON o.id = i.org_id
  WHERE i.token = p_token
    AND i.accepted_at IS NULL
    AND i.expires_at > NOW()
    AND LOWER(i.email) = LOWER(v_user_email);

  IF v_invitation IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'Invalid, expired, or already used invitation'::TEXT;
    RETURN;
  END IF;

  -- CRITICAL FIX: Ensure profile exists before creating membership
  -- This handles cases where the trigger didn't run or failed
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      profile_status,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_user_email,
      'active',
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;

    RAISE LOG '[accept_org_invitation] Created missing profile for user: %', v_user_id;
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_invitation.org_id AND om.user_id = v_user_id
  ) THEN
    RETURN QUERY SELECT
      false,
      v_invitation.org_id,
      v_invitation.org_name,
      NULL::TEXT,
      'Already a member of this organization'::TEXT;
    RETURN;
  END IF;

  -- Create membership (now safe - profile guaranteed to exist)
  INSERT INTO organization_memberships (org_id, user_id, role)
  VALUES (v_invitation.org_id, v_user_id, v_invitation.role);

  -- Mark invitation as accepted
  UPDATE organization_invitations
  SET accepted_at = NOW()
  WHERE organization_invitations.id = v_invitation.id;

  RETURN QUERY SELECT
    true,
    v_invitation.org_id,
    v_invitation.org_name,
    v_invitation.role,
    NULL::TEXT;
END;
$function$;

-- Add comments
COMMENT ON FUNCTION complete_invite_signup(TEXT) IS 'Completes invite signup by creating membership. Now ensures profile exists before creating membership to prevent FK constraint violations.';
COMMENT ON FUNCTION accept_org_invitation(TEXT) IS 'Accepts an organization invitation and creates membership. Now ensures profile exists before creating membership to prevent FK constraint violations.';
