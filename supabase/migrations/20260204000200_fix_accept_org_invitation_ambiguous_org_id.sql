-- Fix: "column reference org_id is ambiguous" in accept_org_invitation
-- The RETURNS TABLE declares "org_id" which conflicts with table column references
-- Fix: qualify all column references with table aliases

CREATE OR REPLACE FUNCTION "public"."accept_org_invitation"("p_token" "text")
RETURNS TABLE("success" boolean, "org_id" "uuid", "org_name" "text", "role" "text", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invitation RECORD;
  v_user_email TEXT;
BEGIN
  -- Get current user's email
  SELECT au.email INTO v_user_email
  FROM auth.users au
  WHERE au.id = auth.uid();

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

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = v_invitation.org_id AND om.user_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT
      false,
      v_invitation.org_id,
      v_invitation.org_name,
      NULL::TEXT,
      'Already a member of this organization'::TEXT;
    RETURN;
  END IF;

  -- Create membership
  INSERT INTO organization_memberships (org_id, user_id, role)
  VALUES (v_invitation.org_id, auth.uid(), v_invitation.role);

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
$$;
