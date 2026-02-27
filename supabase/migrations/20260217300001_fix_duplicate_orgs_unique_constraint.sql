-- ============================================================================
-- ONBOARD-001: Add UNIQUE constraint to organizations.company_domain
-- ============================================================================
-- Prevents duplicate organizations with the same domain
-- Part of onboarding bug fix (rapid clicking creates multiple orgs)
--
-- SAFETY CHECKS:
-- 1. Verify no existing duplicates before applying:
--    SELECT company_domain, COUNT(*)
--    FROM organizations
--    WHERE company_domain IS NOT NULL
--    GROUP BY company_domain
--    HAVING COUNT(*) > 1;
--
-- 2. If duplicates exist, clean them up manually first
-- ============================================================================

-- Add UNIQUE constraint on company_domain
-- NULL values are allowed (new orgs start with NULL domain)
DO $$ BEGIN
  ALTER TABLE organizations
ADD CONSTRAINT unique_company_domain UNIQUE (company_domain);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add case-insensitive unique index for additional safety
-- This prevents duplicates even with different casing (e.g., "Acme.com" vs "acme.com")
CREATE UNIQUE INDEX IF NOT EXISTS unique_company_domain_lower
ON organizations (LOWER(company_domain))
WHERE company_domain IS NOT NULL;

-- Comment for documentation
COMMENT ON CONSTRAINT unique_company_domain ON organizations IS
  'Ensures each company_domain is unique across organizations. Prevents duplicate orgs from rapid clicking.';
