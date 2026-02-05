-- ========================================================================
-- SIXTY SALES DASHBOARD - STAGING MIGRATION EXECUTION
-- ========================================================================
-- Three critical bug fixes for organization membership issues
-- Execute all statements in Supabase Dashboard SQL Editor
-- Project: caerqjzvuerejfrdtygb
-- ========================================================================

-- ========================================================================
-- MIGRATION 1: Fix member_status initialization (20260205140000)
-- ========================================================================

-- Step 1: Fix all existing NULL member_status values
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE organization_memberships
  SET member_status = 'active'
  WHERE member_status IS NULL
    OR member_status NOT IN ('active', 'removed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ Fixed % memberships with NULL or invalid member_status', v_count;
END $$;

-- Step 2: Add trigger to guarantee member_status='active' on insert
DROP TRIGGER IF EXISTS ensure_member_status_on_insert ON organization_memberships;
DROP FUNCTION IF EXISTS ensure_member_status_on_insert();

CREATE FUNCTION ensure_member_status_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.member_status IS NULL THEN
    NEW.member_status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_member_status_on_insert
BEFORE INSERT ON organization_memberships
FOR EACH ROW
EXECUTE FUNCTION ensure_member_status_on_insert();

-- Step 3: Update create_join_request to consistently check member_status
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
  v_member_count bigint;
  v_org_name text;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  SELECT
    o.name,
    COUNT(om.user_id)
  INTO v_org_name, v_member_count
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
    AND om.member_status = 'active'
  WHERE o.id = p_org_id
  GROUP BY o.id, o.name;

  IF v_org_name IS NULL THEN
    RETURN QUERY SELECT
      false,
      NULL::uuid,
      'Organization not found'::text;
    RETURN;
  END IF;

  IF v_member_count = 0 THEN
    RETURN QUERY SELECT
      false,
      NULL::uuid,
      'This organization is inactive and cannot accept new members. Please create a new organization instead.'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = p_org_id
      AND user_id = p_user_id
      AND member_status = 'active'
  ) THEN
    RETURN QUERY SELECT
      false,
      NULL::uuid,
      'You are already a member of this organization'::text;
    RETURN;
  END IF;

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

-- Step 4: Update approve_join_request to explicitly set member_status='active'
CREATE OR REPLACE FUNCTION approve_join_request(
  p_request_id uuid,
  p_actioned_by_user_id uuid
)
RETURNS TABLE (
  success boolean,
  message text,
  org_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
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

  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only active org admins can approve requests'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id
    AND member_status = 'active'
  ) THEN
    UPDATE organization_join_requests
    SET status = 'approved',
        actioned_by = auth.uid(),
        actioned_at = NOW()
    WHERE id = p_request_id;

    RETURN QUERY SELECT
      true,
      'User is already an active member'::text,
      v_request.org_id,
      v_request.user_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id
    AND member_status = 'removed'
  ) THEN
    UPDATE organization_memberships
    SET member_status = 'active',
        removed_at = NULL,
        removed_by = NULL
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id;
  ELSE
    INSERT INTO organization_memberships (
      org_id,
      user_id,
      role,
      member_status
    ) VALUES (
      v_request.org_id,
      v_request.user_id,
      'member',
      'active'
    );
  END IF;

  UPDATE organization_join_requests
  SET status = 'approved',
      actioned_by = auth.uid(),
      actioned_at = NOW()
  WHERE id = p_request_id;

  RETURN QUERY SELECT
    true,
    'Join request approved'::text,
    v_request.org_id,
    v_request.user_id;
END;
$$;

-- Step 5: Ensure reject_join_request also checks member_status correctly
CREATE OR REPLACE FUNCTION reject_join_request(
  p_request_id uuid,
  p_actioned_by_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
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

  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only active org admins can reject requests'::text;
    RETURN;
  END IF;

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

DO $$
BEGIN
  RAISE NOTICE '✅ MIGRATION 1 COMPLETE: member_status initialization fixed';
END $$;

-- ========================================================================
-- MIGRATION 2: Fix RLS Policy (20260205170000)
-- ========================================================================

CREATE SCHEMA IF NOT EXISTS app_auth;

CREATE OR REPLACE FUNCTION app_auth.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  "public"."is_service_role"()
  OR "app_auth"."is_admin"()
  OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'readonly'::"text"]))
  OR ("user_id" = "auth"."uid"())
);

COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships:
 - Service role and platform admins can view all memberships
 - Users can view memberships for orgs they belong to
 - Users can view their own membership record
 This ensures member counts display correctly in admin pages';

DO $$
BEGIN
  RAISE NOTICE '✅ MIGRATION 2 COMPLETE: RLS policy fixed';
END $$;

-- ========================================================================
-- MIGRATION 3: Fix Member Visibility (20260205180000)
-- ========================================================================

DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  "public"."is_service_role"()
  OR
  "app_auth"."is_admin"()
  OR
  ("public"."get_org_role"("auth"."uid"(), "org_id") IS NOT NULL)
  OR
  ("user_id" = "auth"."uid"())
);

COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships:
 Rules for viewing membership data:
 1. Service role can view all (edge functions, backend)
 2. Platform admins (is_admin=true) can view all
 3. Users who are members of an org (ANY role) can see all members of that org
 4. Users can always see their own membership record

 Security model: An organization''s member list is private to members.
 Only people already in the organization can see who else is in it.
 This is enforced at the RLS level.';

DO $$
BEGIN
  RAISE NOTICE '✅ MIGRATION 3 COMPLETE: Member visibility fixed';
END $$;

-- ========================================================================
-- SUMMARY
-- ========================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✨ SUCCESS: All migrations executed!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Changes Made:';
  RAISE NOTICE '  1. Fixed member_status initialization (null → active)';
  RAISE NOTICE '  2. Added trigger to ensure member_status=active on insert';
  RAISE NOTICE '  3. Created app_auth.is_admin() function for platform admins';
  RAISE NOTICE '  4. Fixed RLS policy to allow org member visibility';
  RAISE NOTICE '  5. Changed role check from = ANY to IS NOT NULL';
  RAISE NOTICE '';
  RAISE NOTICE '✓ Organization creation now sets member_status=active';
  RAISE NOTICE '✓ Member counts will display correctly';
  RAISE NOTICE '✓ Owner information will be visible';
  RAISE NOTICE '✓ Users can see all members of their organizations';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next: Refresh your staging app at https://localhost:5175';
  RAISE NOTICE '';
END $$;
