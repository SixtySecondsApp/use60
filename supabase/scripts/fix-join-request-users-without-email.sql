-- Fix users in join requests who don't have profiles or have profiles without emails
-- This script identifies and fixes these cases

-- Step 1: Identify join requests where users don't have profiles
SELECT
  jr.id as join_request_id,
  jr.email as join_request_email,
  jr.user_id,
  'NO_PROFILE' as issue
FROM organization_join_requests jr
LEFT JOIN profiles p ON p.id = jr.user_id
WHERE p.id IS NULL
  AND jr.status = 'pending'
ORDER BY jr.requested_at DESC;

-- Step 2: Identify join requests where users have profiles but no email
SELECT
  jr.id as join_request_id,
  jr.email as join_request_email,
  jr.user_id,
  p.email as profile_email,
  'PROFILE_NO_EMAIL' as issue
FROM organization_join_requests jr
INNER JOIN profiles p ON p.id = jr.user_id
WHERE (p.email IS NULL OR TRIM(p.email) = '')
  AND jr.status = 'pending'
ORDER BY jr.requested_at DESC;

-- Step 3: Create profiles for users who don't have them
INSERT INTO profiles (
  id,
  email,
  first_name,
  last_name,
  profile_status
)
SELECT DISTINCT
  jr.user_id,
  COALESCE(au.email, jr.email),
  COALESCE(
    (jr.user_profile->>'first_name')::text,
    au.raw_user_meta_data->>'first_name',
    SPLIT_PART(COALESCE(au.email, jr.email), '@', 1)
  ),
  COALESCE(
    (jr.user_profile->>'last_name')::text,
    au.raw_user_meta_data->>'last_name',
    ''
  ),
  'pending_approval'
FROM organization_join_requests jr
LEFT JOIN profiles p ON p.id = jr.user_id
LEFT JOIN auth.users au ON au.id = jr.user_id
WHERE p.id IS NULL
  AND jr.status = 'pending'
ON CONFLICT (id) DO NOTHING;

-- Step 4: Update existing profiles that have missing emails
UPDATE profiles p
SET
  email = COALESCE(NULLIF(TRIM(p.email), ''), au.email, jr.email),
  first_name = COALESCE(
    NULLIF(TRIM(p.first_name), ''),
    (jr.user_profile->>'first_name')::text,
    au.raw_user_meta_data->>'first_name',
    SPLIT_PART(COALESCE(au.email, jr.email), '@', 1)
  ),
  last_name = COALESCE(
    NULLIF(TRIM(p.last_name), ''),
    (jr.user_profile->>'last_name')::text,
    au.raw_user_meta_data->>'last_name',
    ''
  ),
  updated_at = NOW()
FROM organization_join_requests jr
LEFT JOIN auth.users au ON au.id = jr.user_id
WHERE p.id = jr.user_id
  AND jr.status = 'pending'
  AND (p.email IS NULL OR TRIM(p.email) = '' OR p.first_name IS NULL OR TRIM(p.first_name) = '');

-- Step 5: Verify all pending join requests now have valid user profiles
SELECT
  jr.id as join_request_id,
  jr.email as join_request_email,
  jr.user_id,
  p.email as profile_email,
  p.first_name,
  p.last_name,
  CASE
    WHEN p.id IS NULL THEN '❌ NO PROFILE'
    WHEN p.email IS NULL OR TRIM(p.email) = '' THEN '❌ NO EMAIL'
    ELSE '✅ VALID'
  END as status
FROM organization_join_requests jr
LEFT JOIN profiles p ON p.id = jr.user_id
WHERE jr.status = 'pending'
ORDER BY jr.requested_at DESC;
