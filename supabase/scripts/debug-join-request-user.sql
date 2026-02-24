-- Debug script to check the user associated with the join request
-- This helps identify why approval is failing

-- 1. Check the join request details
SELECT
  jr.id,
  jr.email as request_email,
  jr.user_id,
  jr.status,
  jr.org_id,
  jr.requested_at
FROM organization_join_requests jr
WHERE jr.org_id = 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6'
  AND jr.status = 'pending'
ORDER BY jr.requested_at DESC
LIMIT 5;

-- 2. Check the user's profile
SELECT
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.profile_status,
  p.created_at,
  LENGTH(TRIM(COALESCE(p.email, ''))) as email_length,
  p.email IS NULL as email_is_null,
  p.email = '' as email_is_empty
FROM organization_join_requests jr
LEFT JOIN profiles p ON p.id = jr.user_id
WHERE jr.org_id = 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6'
  AND jr.status = 'pending';

-- 3. Check auth.users to see if email exists there
SELECT
  au.id,
  au.email,
  au.raw_user_meta_data->>'email' as metadata_email,
  au.raw_user_meta_data->>'first_name' as metadata_first_name,
  au.raw_user_meta_data->>'last_name' as metadata_last_name,
  au.created_at
FROM organization_join_requests jr
LEFT JOIN auth.users au ON au.id = jr.user_id
WHERE jr.org_id = 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6'
  AND jr.status = 'pending';

-- 4. Check if profile exists at all
SELECT
  jr.user_id,
  jr.email as join_request_email,
  CASE
    WHEN p.id IS NULL THEN 'NO PROFILE EXISTS'
    WHEN p.email IS NULL THEN 'PROFILE EXISTS BUT EMAIL IS NULL'
    WHEN TRIM(p.email) = '' THEN 'PROFILE EXISTS BUT EMAIL IS EMPTY STRING'
    ELSE 'PROFILE HAS EMAIL: ' || p.email
  END as profile_status
FROM organization_join_requests jr
LEFT JOIN profiles p ON p.id = jr.user_id
WHERE jr.org_id = 'c7ab1120-d52c-4144-94e9-8c7fbaf27ca6'
  AND jr.status = 'pending';
