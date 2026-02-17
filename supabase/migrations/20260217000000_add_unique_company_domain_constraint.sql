-- Migration: Add UNIQUE constraint to organizations.company_domain
-- Purpose: Prevent duplicate organizations with same domain (Bug ONBOARD-001)
-- Author: Sonnet-Backend
-- Date: 2026-02-17
-- Verified by: Haiku-DB (zero duplicates in production/staging)

-- Add unique constraint on company_domain
-- Note: PostgreSQL allows multiple NULL values in UNIQUE columns (per SQL standard)
-- This means nullable domains won't cause constraint violations
ALTER TABLE public.organizations
ADD CONSTRAINT organizations_company_domain_unique UNIQUE (company_domain);

-- Add case-insensitive unique index to catch variations like "use60.com" vs "Use60.com"
-- This ensures domain matching is case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS organizations_company_domain_lower_unique
ON public.organizations (LOWER(company_domain))
WHERE company_domain IS NOT NULL;

-- Add comment for documentation
COMMENT ON CONSTRAINT organizations_company_domain_unique ON public.organizations IS
'Prevents duplicate organizations with the same company domain. Part of ONBOARD-001 bugfix for rapid-click duplicate creation.';
