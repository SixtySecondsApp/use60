-- Fix: Ensure defensive profile creation includes first_name/last_name from auth metadata
-- Issue: If client-side profile upsert fails, RPC creates profile without names
-- Solution: Pull first_name/last_name from auth.users.raw_user_meta_data during defensive creation

-- =====================================================
-- Fix complete_invite_signup - add name extraction
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
  v_user RECORD;
  v_org_name TEXT;
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
  SELECT au.id, au.email, au.raw_user_meta_data
  INTO v_user
  FROM auth.users au
  WHERE au.email = LOWER(v_invitation.email);

  IF v_user.id IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'User account not found'::TEXT;
    RETURN;
  END IF;

  -- Ensure profile exists with names from auth metadata
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user.id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      first_name,
      last_name,
      profile_status,
      created_at,
      updated_at
    ) VALUES (
      v_user.id,
      v_user.email,
      COALESCE(v_user.raw_user_meta_data->>'first_name', ''),
      COALESCE(v_user.raw_user_meta_data->>'last_name', ''),
      'active',
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;

    RAISE LOG '[complete_invite_signup] Created missing profile for user: %', v_user.id;
  ELSE
    -- Profile exists but may be missing names (e.g., created by trigger without metadata)
    UPDATE public.profiles
    SET
      first_name = COALESCE(NULLIF(profiles.first_name, ''), v_user.raw_user_meta_data->>'first_name', profiles.first_name),
      last_name = COALESCE(NULLIF(profiles.last_name, ''), v_user.raw_user_meta_data->>'last_name', profiles.last_name),
      updated_at = NOW()
    WHERE profiles.id = v_user.id
      AND (profiles.first_name IS NULL OR profiles.first_name = '' OR profiles.last_name IS NULL OR profiles.last_name = '');
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_memberships.org_id = v_invitation.org_id AND organization_memberships.user_id = v_user.id
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
  VALUES (v_invitation.org_id, v_user.id, v_invitation.role);

  -- Mark invitation as accepted
  UPDATE organization_invitations
  SET accepted_at = NOW()
  WHERE organization_invitations.id = v_invitation.id;

  -- Mark onboarding as complete for invited users
  INSERT INTO user_onboarding_progress (user_id, onboarding_step, onboarding_completed_at, skipped_onboarding)
  VALUES (v_user.id, 'complete', NOW(), false)
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
-- Fix accept_org_invitation - add name extraction
-- =====================================================

CREATE OR REPLACE FUNCTION public.accept_org_invitation(p_token TEXT)
RETURNS TABLE(success BOOLEAN, org_id UUID, org_name TEXT, role TEXT, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invitation RECORD;
  v_user RECORD;
BEGIN
  -- Get current user's details including metadata
  SELECT au.email, au.id, au.raw_user_meta_data
  INTO v_user
  FROM auth.users au
  WHERE au.id = auth.uid();

  IF v_user.id IS NULL THEN
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
    AND LOWER(i.email) = LOWER(v_user.email);

  IF v_invitation IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'Invalid, expired, or already used invitation'::TEXT;
    RETURN;
  END IF;

  -- Ensure profile exists with names from auth metadata
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user.id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      first_name,
      last_name,
      profile_status,
      created_at,
      updated_at
    ) VALUES (
      v_user.id,
      v_user.email,
      COALESCE(v_user.raw_user_meta_data->>'first_name', ''),
      COALESCE(v_user.raw_user_meta_data->>'last_name', ''),
      'active',
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO NOTHING;

    RAISE LOG '[accept_org_invitation] Created missing profile for user: %', v_user.id;
  ELSE
    -- Profile exists but may be missing names
    UPDATE public.profiles
    SET
      first_name = COALESCE(NULLIF(profiles.first_name, ''), v_user.raw_user_meta_data->>'first_name', profiles.first_name),
      last_name = COALESCE(NULLIF(profiles.last_name, ''), v_user.raw_user_meta_data->>'last_name', profiles.last_name),
      updated_at = NOW()
    WHERE profiles.id = v_user.id
      AND (profiles.first_name IS NULL OR profiles.first_name = '' OR profiles.last_name IS NULL OR profiles.last_name = '');
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_invitation.org_id AND om.user_id = v_user.id
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
  VALUES (v_invitation.org_id, v_user.id, v_invitation.role);

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

COMMENT ON FUNCTION complete_invite_signup(TEXT) IS 'Completes invite signup by creating membership. Ensures profile exists with names from auth metadata.';
COMMENT ON FUNCTION accept_org_invitation(TEXT) IS 'Accepts an organization invitation and creates membership. Ensures profile exists with names from auth metadata.';
