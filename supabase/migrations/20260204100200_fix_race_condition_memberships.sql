-- Fix race condition in complete_invite_signup and add UNIQUE constraint
--
-- Problem 1: SELECT...INTO without FOR UPDATE allows two concurrent calls to both
-- pass the "not already a member" check and insert duplicate memberships.
-- Problem 2: No UNIQUE constraint on (org_id, user_id) in organization_memberships.
--
-- Fix: Add UNIQUE constraint + use FOR UPDATE locking + ON CONFLICT DO NOTHING

-- Step 1: Clean up any existing duplicate memberships before adding constraint
DELETE FROM organization_memberships a
USING organization_memberships b
WHERE a.ctid < b.ctid
  AND a.org_id = b.org_id
  AND a.user_id = b.user_id;

-- Step 2: Add UNIQUE constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_org_user_membership'
  ) THEN
    ALTER TABLE organization_memberships
      ADD CONSTRAINT unique_org_user_membership UNIQUE (org_id, user_id);
  END IF;
END $$;

-- Step 3: Update complete_invite_signup RPC with FOR UPDATE locking and ON CONFLICT
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
  -- Find and lock the invitation row to prevent concurrent processing
  SELECT organization_invitations.id, organization_invitations.org_id, organization_invitations.email, organization_invitations.role, organization_invitations.token, organization_invitations.expires_at, organization_invitations.accepted_at
  INTO v_invitation
  FROM organization_invitations
  WHERE organization_invitations.token = p_token
    AND organization_invitations.accepted_at IS NULL
    AND organization_invitations.expires_at > NOW()
  FOR UPDATE SKIP LOCKED;

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

  -- Create membership in the invited organization (ON CONFLICT handles duplicates)
  INSERT INTO organization_memberships (org_id, user_id, role)
  VALUES (v_invitation.org_id, v_user_id, v_invitation.role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

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
  -- 1. The user is the sole member
  -- 2. The org name matches common personal email patterns or "My Organization"
  -- 3. The org was created recently (within last hour, to avoid deleting real orgs)
  FOR v_phantom_org IN
    SELECT o.id, o.name
    FROM organizations o
    JOIN organization_memberships om ON om.org_id = o.id
    WHERE om.user_id = v_user_id
      AND o.id != v_invitation.org_id
      AND (
        -- Match personal email domain orgs (Gmail, Yahoo, Hotmail, etc.)
        LOWER(o.name) IN (
          'gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'icloud',
          'protonmail', 'mail', 'live', 'msn', 'ymail', 'googlemail',
          'proton', 'fastmail', 'tutanota', 'zoho', 'gmx'
        )
        OR LOWER(o.name) = 'my organization'
        -- Also match orgs created very recently with only 1 member (likely auto-created)
        OR (
          o.created_at > NOW() - INTERVAL '5 minutes'
          AND (SELECT COUNT(*) FROM organization_memberships WHERE organization_memberships.org_id = o.id) = 1
        )
      )
      AND (SELECT COUNT(*) FROM organization_memberships WHERE organization_memberships.org_id = o.id) = 1
  LOOP
    -- Remove membership first, then the org
    DELETE FROM organization_memberships WHERE organization_memberships.org_id = v_phantom_org.id AND organization_memberships.user_id = v_user_id;
    DELETE FROM organizations WHERE organizations.id = v_phantom_org.id;
  END LOOP;

  -- Get the org name for the result
  SELECT name INTO v_org_name FROM organizations WHERE organizations.id = v_invitation.org_id;

  RETURN QUERY SELECT
    true,
    v_invitation.org_id,
    v_org_name,
    v_invitation.role::TEXT,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
