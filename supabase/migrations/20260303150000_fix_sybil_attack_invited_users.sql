-- ============================================================================
-- US-004: Fix Sybil Attack — Invited Users Must NOT Get Free Credits
-- ============================================================================
-- Invited org members join an existing org and share org-level credits.
-- They should NOT receive the 100 free trial credits (via setup wizard)
-- and should NOT see the purple Setup wizard button.
--
-- Fix 1: complete_invite_signup — auto-dismiss setup wizard for invited users
-- Fix 2: complete_setup_wizard_step — skip credit award for non-owner members
-- ============================================================================

-- ============================================================================
-- Fix 1: Update complete_invite_signup to dismiss setup wizard for invited users
-- ============================================================================
-- When an invited user completes signup, we mark their setup_wizard_progress
-- as fully dismissed (is_dismissed=true, all_completed=true) so the wizard
-- never appears and credits are never awarded.

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
      signup_source,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_user_email,
      'active',
      'invite',
      NOW(),
      NOW()
    ) ON CONFLICT (id) DO UPDATE SET signup_source = 'invite';

    RAISE LOG '[complete_invite_signup] Created missing profile for user: %', v_user_id;
  ELSE
    -- Update signup_source to 'invite' for existing profiles
    UPDATE public.profiles
    SET signup_source = 'invite'
    WHERE id = v_user_id;
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

  -- SYBIL FIX: Dismiss the setup wizard for invited users so they cannot
  -- earn credits by completing wizard steps. Invited members share the
  -- org's credit balance — they should not receive personal credit grants.
  INSERT INTO setup_wizard_progress (
    user_id, org_id,
    step_calendar, step_notetaker, step_crm, step_followups, step_test,
    credits_calendar, credits_notetaker, credits_crm, credits_followups, credits_test,
    is_dismissed, all_completed
  ) VALUES (
    v_user_id, v_invitation.org_id,
    true, true, true, true, true,
    true, true, true, true, true,
    true, true
  )
  ON CONFLICT (user_id, org_id) DO UPDATE SET
    is_dismissed = true,
    all_completed = true,
    credits_calendar = true,
    credits_notetaker = true,
    credits_crm = true,
    credits_followups = true,
    credits_test = true,
    updated_at = NOW();

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

-- ============================================================================
-- Fix 2: Update complete_setup_wizard_step to block credits for invited members
-- ============================================================================
-- Even if an invited user somehow reaches the wizard (e.g., direct URL access),
-- the RPC will not award credits if:
--   - Their profile.signup_source = 'invite', OR
--   - Their org membership role is 'member' (not 'owner' or 'admin')
-- Credits are an org-level resource for invited members; they don't need
-- personal wizard credit grants.

CREATE OR REPLACE FUNCTION complete_setup_wizard_step(
  p_user_id UUID,
  p_org_id UUID,
  p_step TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row setup_wizard_progress%ROWTYPE;
  v_credits_awarded BOOLEAN := false;
  v_credits_amount INTEGER := 20;
  v_all_done BOOLEAN;
  v_step_col TEXT;
  v_step_at_col TEXT;
  v_credits_col TEXT;
  v_is_invited_member BOOLEAN := false;
BEGIN
  -- Validate step name
  IF p_step NOT IN ('calendar', 'notetaker', 'crm', 'followups', 'test') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid step: ' || p_step);
  END IF;

  -- SYBIL CHECK: Determine if this user is an invited member (not the org owner/admin)
  -- Invited members share org credits and should not receive wizard step credits.
  SELECT (
    -- User joined via invitation (signup_source = 'invite')
    (SELECT signup_source FROM public.profiles WHERE id = p_user_id) = 'invite'
    OR
    -- User is a plain member (not owner or admin) in this org
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = p_user_id
        AND om.org_id = p_org_id
        AND om.role = 'member'
        AND NOT EXISTS (
          -- Confirm they are not the org owner (owners have role='owner')
          SELECT 1 FROM organizations o WHERE o.id = p_org_id AND o.owner_id = p_user_id
        )
    )
  ) INTO v_is_invited_member;

  v_step_col := 'step_' || p_step;
  v_step_at_col := 'step_' || p_step || '_at';
  v_credits_col := 'credits_' || p_step;

  -- Upsert the progress row
  INSERT INTO setup_wizard_progress (user_id, org_id)
  VALUES (p_user_id, p_org_id)
  ON CONFLICT (user_id, org_id) DO NOTHING;

  -- Lock the row for update
  SELECT * INTO v_row
  FROM setup_wizard_progress
  WHERE user_id = p_user_id AND org_id = p_org_id
  FOR UPDATE;

  -- Mark step completed (idempotent)
  EXECUTE format(
    'UPDATE setup_wizard_progress SET %I = true, %I = COALESCE(%I, NOW()), updated_at = NOW() WHERE id = $1',
    v_step_col, v_step_at_col, v_step_at_col
  ) USING v_row.id;

  -- Award credits ONLY if:
  --   1. Credits not already awarded for this step, AND
  --   2. User is NOT an invited member (sybil protection)
  IF NOT v_is_invited_member THEN
    EXECUTE format(
      'SELECT %I FROM setup_wizard_progress WHERE id = $1',
      v_credits_col
    ) INTO v_credits_awarded USING v_row.id;

    IF NOT v_credits_awarded THEN
      -- Award credits via existing add_credits function
      PERFORM add_credits(
        p_org_id,
        v_credits_amount::DECIMAL,
        'bonus',
        'Setup wizard: ' || p_step || ' step completed',
        NULL,
        p_user_id
      );

      -- Mark credits as awarded
      EXECUTE format(
        'UPDATE setup_wizard_progress SET %I = true, updated_at = NOW() WHERE id = $1',
        v_credits_col
      ) USING v_row.id;

      v_credits_awarded := true;
    ELSE
      v_credits_awarded := false;
    END IF;
  ELSE
    -- Invited member: mark credits as "awarded" in the DB to prevent future attempts
    -- but do not actually grant any credits
    EXECUTE format(
      'UPDATE setup_wizard_progress SET %I = true, updated_at = NOW() WHERE id = $1',
      v_credits_col
    ) USING v_row.id;

    v_credits_awarded := false;
  END IF;

  -- Check if all 5 steps are done
  SELECT (step_calendar AND step_notetaker AND step_crm AND step_followups AND step_test)
  INTO v_all_done
  FROM setup_wizard_progress
  WHERE id = v_row.id;

  IF v_all_done THEN
    UPDATE setup_wizard_progress
    SET all_completed = true, updated_at = NOW()
    WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'credits_awarded', v_credits_awarded,
    'credits_amount', CASE WHEN v_credits_awarded THEN v_credits_amount ELSE 0 END,
    'all_completed', COALESCE(v_all_done, false)
  );
END;
$$;

COMMENT ON FUNCTION complete_invite_signup(TEXT) IS
  'Completes invite signup: creates membership, marks onboarding complete, and dismisses setup wizard for invited users to prevent sybil credit farming. Sets signup_source=invite on profile.';

COMMENT ON FUNCTION complete_setup_wizard_step(UUID, UUID, TEXT) IS
  'Marks a setup wizard step complete. Credits are NOT awarded to invited members (signup_source=invite or role=member without owner status) to prevent sybil attacks.';
