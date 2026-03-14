-- Migration: fix_invite_auto_verify_email
-- Date: 20260312115933
--
-- What this migration does:
--   Extends the auto_verify_email trigger to also auto-confirm emails for users
--   with pending organization invitations. Previously only waitlist users got
--   auto-confirmed, leaving invited users stuck in a verify-email loop.
--   Also adds email auto-confirm safety net in complete_invite_signup RPC.
--
-- Rollback strategy:
--   Re-apply the previous version of auto_verify_email_for_access_code_user
--   from baseline.sql (waitlist-only check). Revert complete_invite_signup
--   from 20260211130000_fix_invite_missing_profile_v2.sql.

-- =====================================================
-- 1. Extend auto-verify trigger to check invitations
-- =====================================================

CREATE OR REPLACE FUNCTION public.auto_verify_email_for_access_code_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_has_waitlist_entry BOOLEAN;
  v_has_pending_invitation BOOLEAN;
BEGIN
  -- Check for waitlist entry (existing behavior)
  SELECT EXISTS (
    SELECT 1
    FROM public.meetings_waitlist mw
    WHERE (mw.user_id = NEW.id OR LOWER(mw.email) = LOWER(NEW.email))
      AND mw.status IN ('released', 'pending', 'converted')
  ) INTO v_has_waitlist_entry;

  -- Check for pending organization invitation matching this email
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_invitations oi
    WHERE LOWER(oi.email) = LOWER(NEW.email)
      AND oi.accepted_at IS NULL
      AND oi.expires_at > NOW()
  ) INTO v_has_pending_invitation;

  -- Auto-verify email if user has waitlist entry OR pending invitation
  IF v_has_waitlist_entry OR v_has_pending_invitation THEN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = NEW.id AND email_confirmed_at IS NULL;

    IF v_has_pending_invitation THEN
      RAISE NOTICE 'Auto-verified email for user % (has pending org invitation)', NEW.id;
    ELSE
      RAISE NOTICE 'Auto-verified email for user % (has waitlist entry)', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_verify_email_for_access_code_user() IS
'Auto-verifies email for users who signed up with valid access codes (waitlist entry) or pending organization invitations.';

-- =====================================================
-- 2. Update complete_invite_signup with email confirm safety net
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

  -- SAFETY NET: Auto-confirm email if not yet confirmed
  -- The trigger should handle this on signup, but this covers edge cases
  -- (e.g., user created account before invitation was sent)
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = v_user_id AND email_confirmed_at IS NULL;

  -- Ensure profile exists before creating membership
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

  -- Create membership
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

  -- Fetch organization name for response
  SELECT name INTO v_org_name FROM organizations WHERE organizations.id = v_invitation.org_id;

  RETURN QUERY SELECT
    true,
    v_invitation.org_id,
    v_org_name,
    v_invitation.role,
    NULL::TEXT;
END;
$function$;

COMMENT ON FUNCTION complete_invite_signup(TEXT) IS 'Completes invite signup: auto-confirms email, creates profile + membership, marks onboarding complete.';
