-- Create a dedicated test organization for the onboarding simulator
-- This ensures consistent testing without interfering with real user data

DO $$
DECLARE
  test_org_id UUID := '00000000-0000-0000-0000-000000000001'; -- Recognizable test UUID
  test_user_id UUID;
BEGIN
  -- Get or create a test user (using the service account or first admin)
  SELECT id INTO test_user_id 
  FROM auth.users 
  WHERE email LIKE '%@use60.com' 
  LIMIT 1;

  -- If no admin user found, use the first user
  IF test_user_id IS NULL THEN
    SELECT id INTO test_user_id 
    FROM auth.users 
    LIMIT 1;
  END IF;

  -- Delete existing test org if it exists (idempotent)
  DELETE FROM organizations WHERE id = test_org_id;

  -- Create the test organization
  INSERT INTO organizations (
    id,
    name,
    company_domain,
    created_by,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    test_org_id,
    'Simulator Test Organization',
    'simulator-test.internal',
    test_user_id,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    company_domain = EXCLUDED.company_domain,
    updated_at = NOW();

  -- Create membership for the test user
  INSERT INTO organization_memberships (
    org_id,
    user_id,
    role,
    created_at,
    updated_at
  ) VALUES (
    test_org_id,
    test_user_id,
    'owner',
    NOW(),
    NOW()
  )
  ON CONFLICT (org_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    updated_at = NOW();

  -- Clean up any existing enrichments for this test org
  DELETE FROM organization_enrichment WHERE organization_id = test_org_id;
  DELETE FROM organization_context WHERE organization_id = test_org_id;
  DELETE FROM organization_skills WHERE organization_id = test_org_id;

  RAISE NOTICE 'Test organization created: %', test_org_id;
END $$;
