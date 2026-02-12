-- VER-001: Domain normalization + uniqueness constraint
-- Adds a normalize_company_domain() SQL function, a combined BEFORE trigger
-- that normalizes domains and auto-sets is_org_profile, normalizes existing
-- data, and creates a partial unique index on (organization_id, company_domain).

-- ---------------------------------------------------------------------------
-- 1. Domain normalization function (IMMUTABLE for index use)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_company_domain(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          LOWER(TRIM(raw)),
          '^https?://', ''          -- strip protocol
        ),
        '^www\.', ''                -- strip www prefix
      ),
      '[/?#].*$', ''               -- strip path / query / fragment
    ),
    ''                              -- return NULL instead of empty string
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Combined BEFORE INSERT/UPDATE trigger function
--    - Normalizes company_domain
--    - Auto-sets is_org_profile when domain matches org's company_domain
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fact_profile_domain_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  org_domain TEXT;
BEGIN
  -- Normalize the incoming domain
  IF NEW.company_domain IS NOT NULL THEN
    NEW.company_domain := public.normalize_company_domain(NEW.company_domain);
  END IF;

  -- Look up the organization's own domain
  SELECT public.normalize_company_domain(o.company_domain)
    INTO org_domain
    FROM public.organizations o
   WHERE o.id = NEW.organization_id;

  -- Auto-set is_org_profile based on domain match
  IF org_domain IS NOT NULL
     AND NEW.company_domain IS NOT NULL
     AND NEW.company_domain = org_domain
  THEN
    NEW.is_org_profile := TRUE;
  ELSE
    -- Only clear if domain was explicitly changed (not on unrelated updates)
    IF TG_OP = 'INSERT' THEN
      NEW.is_org_profile := COALESCE(NEW.is_org_profile, FALSE);
    ELSIF TG_OP = 'UPDATE' AND OLD.company_domain IS DISTINCT FROM NEW.company_domain THEN
      NEW.is_org_profile := FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if it exists, then create
DROP TRIGGER IF EXISTS trg_fact_profile_domain_handler ON public.client_fact_profiles;

CREATE TRIGGER trg_fact_profile_domain_handler
  BEFORE INSERT OR UPDATE ON public.client_fact_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fact_profile_domain_handler();

-- ---------------------------------------------------------------------------
-- 3. Normalize existing data
-- ---------------------------------------------------------------------------

UPDATE public.client_fact_profiles
   SET company_domain = public.normalize_company_domain(company_domain)
 WHERE company_domain IS NOT NULL
   AND company_domain IS DISTINCT FROM public.normalize_company_domain(company_domain);

-- ---------------------------------------------------------------------------
-- 4. Partial unique index — one profile per domain per org (NULLs allowed)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_domain_per_org
  ON public.client_fact_profiles (organization_id, company_domain)
  WHERE company_domain IS NOT NULL;
