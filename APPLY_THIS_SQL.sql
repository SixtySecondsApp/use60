-- =====================================================
-- FIX FOR ORGANIZATION REACTIVATION BUTTONS
-- =====================================================
-- This fixes the "Request Reactivation" and "Leave Organization" buttons
-- that were failing due to incorrect function parameter count
--
-- TO APPLY:
-- 1. Go to: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql/new
-- 2. Copy this entire file
-- 3. Paste into the SQL Editor
-- 4. Click "Run"
-- =====================================================

-- MIGRATION 1: Fix RLS Policies
-- The is_org_member function requires two parameters: (user_id, org_id)
-- but the original policies were calling it with only one parameter

DROP POLICY IF EXISTS "Members can view org reactivation requests" ON organization_reactivation_requests;
DROP POLICY IF EXISTS "Members can create reactivation requests" ON organization_reactivation_requests;
DROP POLICY IF EXISTS "Service role can manage all reactivation requests" ON organization_reactivation_requests;

CREATE POLICY "Members can view org reactivation requests"
  ON organization_reactivation_requests FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Members can create reactivation requests"
  ON organization_reactivation_requests FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Service role can manage all reactivation requests"
  ON organization_reactivation_requests FOR ALL
  USING (is_service_role_user());

-- MIGRATION 2: Fix RPC Function
-- The is_org_member function requires two parameters: (user_id, org_id)
-- but the original RPC was calling it with only one parameter

CREATE OR REPLACE FUNCTION request_organization_reactivation(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_org_name TEXT;
  v_existing_request UUID;
  v_request_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Not authenticated');
  END IF;

  -- Check if user is member of the org (with correct parameter count)
  IF NOT is_org_member(v_user_id, p_org_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Not a member of this organization');
  END IF;

  -- Get org name
  SELECT name INTO v_org_name FROM organizations WHERE id = p_org_id;

  -- Check if there's already a pending request
  SELECT id INTO v_existing_request
  FROM organization_reactivation_requests
  WHERE org_id = p_org_id AND status = 'pending';

  IF v_existing_request IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Reactivation request already pending',
      'request_id', v_existing_request
    );
  END IF;

  -- Create new reactivation request
  INSERT INTO organization_reactivation_requests (org_id, requested_by, status)
  VALUES (p_org_id, v_user_id, 'pending')
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Reactivation request submitted successfully',
    'request_id', v_request_id
  );
END;
$$;

-- =====================================================
-- DONE! Refresh your app and the buttons should work.
-- =====================================================
