-- Migration: Move user to correct organization (sixtyseconds.video)
-- Context: User parishmax44@gmail.com signed up and completed onboarding with
-- sixtyseconds.video domain, but was incorrectly added to Max's Company instead
-- Solution: Remove from Max's Company and add to sixtyseconds.video

-- Get the user ID from email (Max Parish)
WITH user_data AS (
  SELECT id AS user_id
  FROM auth.users
  WHERE email = 'parishmax44@gmail.com'
  LIMIT 1
),
max_company_org AS (
  SELECT id AS org_id
  FROM organizations
  WHERE name = 'Max''s Company'
    AND is_active = true
  LIMIT 1
),
sixtyseconds_org AS (
  SELECT id AS org_id
  FROM organizations
  WHERE LOWER(name) = 'sixtyseconds.video'
    AND is_active = true
  LIMIT 1
)
-- First, remove user from Max's Company
DELETE FROM organization_memberships
WHERE user_id = (SELECT user_id FROM user_data)
  AND org_id = (SELECT org_id FROM max_company_org);

-- Then, add user to sixtyseconds.video organization
INSERT INTO organization_memberships (org_id, user_id, role)
SELECT
  s.org_id,
  u.user_id,
  'member'
FROM sixtyseconds_org s
CROSS JOIN user_data u
WHERE NOT EXISTS (
  -- Don't insert if user is already a member
  SELECT 1 FROM organization_memberships om
  WHERE om.org_id = s.org_id
    AND om.user_id = u.user_id
)
ON CONFLICT DO NOTHING;

-- Log the migration
DO $$
DECLARE
  v_user_count INTEGER;
  v_removed_count INTEGER;
BEGIN
  -- Count how many memberships were removed
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  RAISE NOTICE 'User parishmax44@gmail.com migration complete:';
  RAISE NOTICE '- Removed from Max''s Company: % membership(s)', v_removed_count;
  RAISE NOTICE '- Added to sixtyseconds.video organization';
END $$;

-- Update the user's profile status to active (in case it was pending)
UPDATE profiles
SET profile_status = 'active'
WHERE email = 'parishmax44@gmail.com';
