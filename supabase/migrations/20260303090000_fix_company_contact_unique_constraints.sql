-- Fix global UNIQUE constraints on companies and contacts tables.
-- In a multi-tenant app, different orgs must be able to have companies
-- with the same name/domain and contacts with the same email.
-- Replace global UNIQUE with per-org UNIQUE (clerk_org_id scoped).

-- Companies: drop global unique, add per-org unique
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_name_key;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_domain_key;

-- Allow same name/domain across different orgs, unique within an org
CREATE UNIQUE INDEX IF NOT EXISTS companies_name_per_org
  ON companies (name, clerk_org_id);
CREATE UNIQUE INDEX IF NOT EXISTS companies_domain_per_org
  ON companies (domain, clerk_org_id) WHERE domain IS NOT NULL;

-- Contacts: drop global unique, add per-org unique
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_per_org
  ON contacts (email, clerk_org_id) WHERE email IS NOT NULL;
