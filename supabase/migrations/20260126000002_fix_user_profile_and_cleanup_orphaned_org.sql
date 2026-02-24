-- Migration: Fix user profile and cleanup orphaned organization
--
-- Issues:
-- 1. User parishmax44@gmail.com (Max Parish) has no profile record, causing "Unknown User" display in team members
-- 2. Orphaned sixtyseconds.video organization with 0 members created 4 days ago
--
-- Fixes:
-- 1. Create profile record for the user with proper name/email
-- 2. Delete the orphaned organization (will cascade cleanup)

-- Create profile record for user if it doesn't exist
INSERT INTO profiles (
  id,
  email,
  first_name,
  last_name,
  created_at,
  updated_at
)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'first_name', 'Max'),
  COALESCE(au.raw_user_meta_data->>'last_name', 'Parish'),
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email = 'parishmax44@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = au.id
  );

-- Delete the orphaned sixtyseconds.video organization (0 members, no creator)
DELETE FROM organizations
WHERE name = 'sixtyseconds.video'
  AND id NOT IN (
    SELECT DISTINCT org_id FROM organization_memberships
  )
  AND created_by IS NULL;

-- Log the cleanup
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_deleted_count
  FROM organizations
  WHERE name = 'sixtyseconds.video'
    AND id NOT IN (SELECT DISTINCT org_id FROM organization_memberships)
    AND created_by IS NULL;

  RAISE NOTICE 'Cleanup complete: Deleted % orphaned organization(s)', v_deleted_count;
END $$;
