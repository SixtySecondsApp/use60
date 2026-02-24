-- Migration: Populate missing company_domain values for organizations
-- Problem: Some organizations were created without company_domain values,
-- causing domain-based matching to fail in onboarding
-- Solution: Set company_domain from organization name when it looks like a domain

-- Update organizations where company_domain is NULL/empty and name looks like a domain
UPDATE organizations
SET
  company_domain = LOWER(name),
  updated_at = NOW()
WHERE
  (company_domain IS NULL OR company_domain = '')
  AND name ~ '\.' -- Name contains a dot (likely a domain)
  AND name !~ ' ' -- Name doesn't contain spaces (not a regular company name)
  AND is_active = true;

-- Log the results
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % organizations with missing company_domain values', v_updated_count;
END $$;

-- Also ensure sixtyseconds.video org specifically has correct domain
UPDATE organizations
SET
  company_domain = 'sixtyseconds.video',
  updated_at = NOW()
WHERE
  LOWER(name) = 'sixtyseconds.video'
  AND (company_domain IS NULL OR company_domain = '')
  AND is_active = true;
