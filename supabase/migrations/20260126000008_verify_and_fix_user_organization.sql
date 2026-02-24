-- Migration: Verify and fix organization membership for parishmax44@gmail.com
-- Goal: Ensure user is in the correct organization (sixtyseconds.video, not Max's Company)

-- First, identify the user and organizations
WITH user_info AS (
  SELECT id as user_id
  FROM public.profiles
  WHERE email = 'parishmax44@gmail.com'
  LIMIT 1
),
orgs AS (
  SELECT
    'maxs_company' as org_type,
    id as org_id,
    name
  FROM public.organizations
  WHERE name = 'Max''s Company' AND is_active = true

  UNION ALL

  SELECT
    'sixtyseconds' as org_type,
    id as org_id,
    name
  FROM public.organizations
  WHERE LOWER(name) LIKE '%sixtyseconds%' AND is_active = true
)
-- Delete user from Max's Company
DELETE FROM public.organization_memberships
WHERE user_id = (SELECT user_id FROM user_info)
  AND org_id = (SELECT org_id FROM orgs WHERE org_type = 'maxs_company');

-- Add user to sixtyseconds.video (if not already there)
INSERT INTO public.organization_memberships (org_id, user_id, role)
SELECT
  o.org_id,
  u.user_id,
  'member'
FROM orgs o
CROSS JOIN user_info u
WHERE o.org_type = 'sixtyseconds'
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.org_id = o.org_id
      AND om.user_id = u.user_id
  )
ON CONFLICT DO NOTHING;

-- Log the changes
DO $$
DECLARE
  v_user_email TEXT := 'parishmax44@gmail.com';
  v_user_id UUID;
  v_current_org TEXT;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE email = v_user_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT o.name INTO v_current_org
    FROM public.organization_memberships om
    JOIN public.organizations o ON om.org_id = o.id
    WHERE om.user_id = v_user_id
    LIMIT 1;

    RAISE NOTICE 'User % (ID: %) organization: %', v_user_email, v_user_id, COALESCE(v_current_org, 'NONE');
  ELSE
    RAISE NOTICE 'User % not found in profiles table', v_user_email;
  END IF;
END $$;
