-- Migration: Fix invite signup to clean up auto-created personal-email organizations
--
-- Problem: When a user signs up via invitation, the auto_create_org_for_new_user trigger
-- (if still active) creates an organization from their email domain (e.g., "Gmail" for
-- gmail.com users). The user then ends up in BOTH the phantom org AND the invited org.
-- Even if the trigger is disabled, existing phantom orgs may still cause issues.
--
-- Fix: Update complete_invite_signup RPC to:
-- 1. Create the invited org membership (existing behavior)
-- 2. Find and remove phantom orgs created from personal email domains
-- 3. Only delete orgs where the user is the sole member
--
-- Also updates the profile with first_name/last_name from auth metadata as a safety net.

CREATE OR REPLACE FUNCTION complete_invite_signup(p_token TEXT)
RETURNS TABLE(
  success BOOLEAN,
  org_id UUID,
  org_name TEXT,
  role TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID;
  v_org_name TEXT;
  v_phantom_org RECORD;
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
  SELECT id INTO v_user_id
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

  -- Get user email for phantom org detection
  v_user_email := LOWER(v_invitation.email);

  -- Check if already a member of the invited org
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

  -- Create membership in the invited organization
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

  -- Clean up phantom organizations created from personal email domains
  -- Only removes orgs where:
  -- 1. User is the sole member
  -- 2. Org name matches a personal email domain (e.g., "Gmail", "Yahoo", "Outlook")
  -- 3. Org is NOT the one the user was just invited to
  FOR v_phantom_org IN
    SELECT om.org_id, o.name
    FROM organization_memberships om
    JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = v_user_id
      AND om.org_id != v_invitation.org_id
      AND (
        -- Match org names that look like they came from personal email domains
        -- e.g., "Gmail", "Yahoo", "Outlook", "Hotmail" etc.
        LOWER(o.name) IN (
          SELECT LOWER(split_part(domain, '.', 1))
          FROM personal_email_domains
        )
        -- Also match "My Organization" (generic fallback name from trigger)
        OR LOWER(o.name) = 'my organization'
      )
      -- Only if user is the sole member
      AND (SELECT COUNT(*) FROM organization_memberships WHERE org_id = om.org_id) = 1
  LOOP
    RAISE NOTICE 'Cleaning up phantom org "%" (id: %) for user %', v_phantom_org.name, v_phantom_org.org_id, v_user_id;

    -- Remove membership
    DELETE FROM organization_memberships
    WHERE org_id = v_phantom_org.org_id AND user_id = v_user_id;

    -- Delete the phantom organization
    DELETE FROM organizations WHERE id = v_phantom_org.org_id;
  END LOOP;

  -- Safety net: update profile with names from auth metadata if they're empty
  UPDATE public.profiles
  SET
    first_name = COALESCE(
      NULLIF(profiles.first_name, ''),
      (SELECT raw_user_meta_data->>'first_name' FROM auth.users WHERE id = v_user_id),
      profiles.first_name
    ),
    last_name = COALESCE(
      NULLIF(profiles.last_name, ''),
      (SELECT raw_user_meta_data->>'last_name' FROM auth.users WHERE id = v_user_id),
      profiles.last_name
    ),
    updated_at = NOW()
  WHERE profiles.id = v_user_id
    AND (profiles.first_name IS NULL OR profiles.first_name = '' OR profiles.last_name IS NULL OR profiles.last_name = '');

  -- Fetch organization name for successful response
  SELECT name INTO v_org_name FROM organizations WHERE organizations.id = v_invitation.org_id;

  RETURN QUERY SELECT
    true,
    v_invitation.org_id,
    v_org_name,
    v_invitation.role,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
