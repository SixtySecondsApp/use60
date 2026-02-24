-- Test script to verify cancel and restart onboarding flow
-- This script simulates the full flow of:
-- 1. User has a pending join request
-- 2. User cancels the request
-- 3. User can restart onboarding

-- ===== STEP 1: Setup Test Data =====
DO $$
DECLARE
  v_test_user_id uuid := 'YOUR_USER_ID_HERE'; -- Replace with actual user ID
  v_test_org_id uuid := 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6';
  v_join_request_id uuid;
BEGIN
  RAISE NOTICE '===== TESTING CANCEL AND RESTART FLOW =====';

  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_test_user_id) THEN
    RAISE EXCEPTION 'Test user % not found', v_test_user_id;
  END IF;

  -- Verify org exists
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_test_org_id) THEN
    RAISE EXCEPTION 'Test organization % not found', v_test_org_id;
  END IF;

  RAISE NOTICE '✅ Test data verified';
END $$;

-- ===== STEP 2: Check Current State =====
SELECT
  '1. CURRENT USER STATE' as check_name,
  p.id as user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.profile_status,
  COUNT(om.org_id) as org_membership_count,
  COUNT(jr.id) as pending_join_requests
FROM profiles p
LEFT JOIN organization_memberships om ON om.user_id = p.id
LEFT JOIN organization_join_requests jr ON jr.user_id = p.id AND jr.status = 'pending'
WHERE p.email LIKE '%YOUR_EMAIL_HERE%' -- Replace with actual email
GROUP BY p.id, p.email, p.first_name, p.last_name, p.profile_status;

-- Check pending join requests
SELECT
  '2. PENDING JOIN REQUESTS' as check_name,
  jr.id,
  jr.email,
  jr.status,
  o.name as organization_name,
  jr.requested_at
FROM organization_join_requests jr
JOIN organizations o ON o.id = jr.org_id
WHERE jr.user_id = (SELECT id FROM profiles WHERE email LIKE '%YOUR_EMAIL_HERE%' LIMIT 1)
  AND jr.status = 'pending';

-- ===== STEP 3: Test Cancel Function =====
DO $$
DECLARE
  v_user_id uuid;
  v_request_id uuid;
  v_result record;
BEGIN
  -- Get user and request IDs
  SELECT id INTO v_user_id FROM profiles WHERE email LIKE '%YOUR_EMAIL_HERE%' LIMIT 1;
  SELECT id INTO v_request_id FROM organization_join_requests WHERE user_id = v_user_id AND status = 'pending' LIMIT 1;

  IF v_request_id IS NULL THEN
    RAISE NOTICE '⚠️ No pending join request found for user. Skipping cancel test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Cancelling join request % for user %', v_request_id, v_user_id;

  -- Call cancel function
  SELECT * INTO v_result FROM cancel_join_request(v_request_id, v_user_id) LIMIT 1;

  IF v_result.success THEN
    RAISE NOTICE '✅ Cancel successful: %', v_result.message;
  ELSE
    RAISE EXCEPTION '❌ Cancel failed: %', v_result.message;
  END IF;
END $$;

-- ===== STEP 4: Verify State After Cancel =====
SELECT
  '3. STATE AFTER CANCEL' as check_name,
  p.id as user_id,
  p.email,
  p.profile_status,
  CASE
    WHEN p.profile_status = 'active' THEN '✅ Status reset to active'
    ELSE '❌ Status should be active but is: ' || p.profile_status
  END as status_check,
  COUNT(jr.id) as remaining_join_requests,
  CASE
    WHEN COUNT(jr.id) = 0 THEN '✅ Join request deleted'
    ELSE '❌ Join request still exists'
  END as request_check
FROM profiles p
LEFT JOIN organization_join_requests jr ON jr.user_id = p.id AND jr.status = 'pending'
WHERE p.email LIKE '%YOUR_EMAIL_HERE%'
GROUP BY p.id, p.email, p.profile_status;

-- Check onboarding progress
SELECT
  '4. ONBOARDING PROGRESS AFTER CANCEL' as check_name,
  uop.user_id,
  uop.onboarding_step,
  uop.onboarding_completed_at,
  CASE
    WHEN uop.onboarding_step = 'website_input' THEN '✅ Step reset to website_input'
    WHEN uop.onboarding_step IS NULL THEN '✅ No onboarding progress (will start fresh)'
    ELSE '⚠️ Step is: ' || uop.onboarding_step
  END as step_check,
  CASE
    WHEN uop.onboarding_completed_at IS NULL THEN '✅ Onboarding not marked complete'
    ELSE '❌ Onboarding should not be complete'
  END as completion_check
FROM user_onboarding_progress uop
WHERE uop.user_id = (SELECT id FROM profiles WHERE email LIKE '%YOUR_EMAIL_HERE%' LIMIT 1);

-- ===== STEP 5: Summary =====
DO $$
DECLARE
  v_user_id uuid;
  v_profile_status text;
  v_pending_requests int;
  v_can_restart boolean := false;
BEGIN
  RAISE NOTICE '===== FINAL VERIFICATION =====';

  SELECT id, profile_status INTO v_user_id, v_profile_status
  FROM profiles WHERE email LIKE '%YOUR_EMAIL_HERE%' LIMIT 1;

  SELECT COUNT(*) INTO v_pending_requests
  FROM organization_join_requests
  WHERE user_id = v_user_id AND status = 'pending';

  -- Check if user can restart onboarding
  v_can_restart := (v_profile_status = 'active' AND v_pending_requests = 0);

  IF v_can_restart THEN
    RAISE NOTICE '✅ SUCCESS: User can restart onboarding!';
    RAISE NOTICE '   - Profile status: %', v_profile_status;
    RAISE NOTICE '   - Pending requests: %', v_pending_requests;
    RAISE NOTICE '   - User should be able to access /onboarding?step=website_input';
  ELSE
    RAISE NOTICE '❌ FAILED: User cannot restart onboarding';
    RAISE NOTICE '   - Profile status: % (should be active)', v_profile_status;
    RAISE NOTICE '   - Pending requests: % (should be 0)', v_pending_requests;
  END IF;
END $$;
