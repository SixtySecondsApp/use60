-- Admin: remove a member from an organization
CREATE OR REPLACE FUNCTION admin_remove_organization_member(
  p_org_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership RECORD;
BEGIN
  -- Gate: platform admin only
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required' USING ERRCODE = '42501';
  END IF;

  -- Check membership exists
  SELECT om.org_id, om.user_id, om.role, p.email
  INTO v_membership
  FROM organization_memberships om
  JOIN profiles p ON p.id = om.user_id
  WHERE om.org_id = p_org_id AND om.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'MEMBER_NOT_FOUND', 'message', 'Member not found in organization');
  END IF;

  -- Delete the membership
  DELETE FROM organization_memberships WHERE org_id = p_org_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'removed_user_id', p_user_id, 'removed_email', v_membership.email, 'org_id', p_org_id);
END;
$$;

-- Admin: add a member to an organization by email
CREATE OR REPLACE FUNCTION admin_add_organization_member(
  p_org_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'member'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_exists BOOLEAN;
  v_already_member BOOLEAN;
BEGIN
  -- Gate: platform admin only
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required' USING ERRCODE = '42501';
  END IF;

  -- Check org exists
  SELECT EXISTS(SELECT 1 FROM organizations WHERE id = p_org_id) INTO v_org_exists;
  IF NOT v_org_exists THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORG_NOT_FOUND', 'message', 'Organization not found');
  END IF;

  -- Find user by email
  SELECT id INTO v_user_id FROM profiles WHERE lower(email) = lower(p_email);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND', 'message', 'No user found with email: ' || p_email);
  END IF;

  -- Check if already a member
  SELECT EXISTS(SELECT 1 FROM organization_memberships WHERE org_id = p_org_id AND user_id = v_user_id) INTO v_already_member;
  IF v_already_member THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_MEMBER', 'message', 'User is already a member of this organization');
  END IF;

  -- Create membership
  INSERT INTO organization_memberships (org_id, user_id, role)
  VALUES (p_org_id, v_user_id, p_role);

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', p_email, 'org_id', p_org_id, 'role', p_role);
END;
$$;

-- Admin: delete an organization and all associated data
CREATE OR REPLACE FUNCTION admin_delete_organization(
  p_org_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org RECORD;
  v_member_count INT;
BEGIN
  -- Gate: platform admin only
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: platform admin required' USING ERRCODE = '42501';
  END IF;

  -- Check org exists
  SELECT id, name INTO v_org FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORG_NOT_FOUND', 'message', 'Organization not found');
  END IF;

  -- Count members for response
  SELECT count(*) INTO v_member_count FROM organization_memberships WHERE org_id = p_org_id;

  -- Delete memberships first (FK dependency)
  DELETE FROM organization_memberships WHERE org_id = p_org_id;

  -- Delete the organization (cascades to related data)
  DELETE FROM organizations WHERE id = p_org_id;

  RETURN jsonb_build_object('success', true, 'deleted_org_id', p_org_id, 'org_name', v_org.name, 'members_removed', v_member_count);
END;
$$;
