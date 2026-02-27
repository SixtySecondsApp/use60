-- VER-002: Version history tables + auto-snapshot triggers
-- Creates version history tables for fact, product, and ICP profiles.
-- BEFORE UPDATE triggers snapshot the OLD row when content changes and
-- auto-increment the version column on the parent row.

-- ---------------------------------------------------------------------------
-- 1. Add version column to product_profiles (fact profiles already have it)
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_profiles
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 2. fact_profile_versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fact_profile_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_profile_id UUID NOT NULL REFERENCES public.client_fact_profiles(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  snapshot        JSONB NOT NULL,           -- research_data at the time
  research_sources JSONB,                   -- research_sources at the time
  changed_by      UUID,                     -- auth.uid() of the user who caused the change
  change_summary  TEXT,                     -- auto-generated or user-provided summary
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_fact_profile_version UNIQUE (fact_profile_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_fact_profile_versions_profile
  ON public.fact_profile_versions (fact_profile_id, version_number DESC);

-- ---------------------------------------------------------------------------
-- 3. product_profile_versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_profile_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_profile_id  UUID NOT NULL REFERENCES public.product_profiles(id) ON DELETE CASCADE,
  version_number      INTEGER NOT NULL,
  snapshot            JSONB NOT NULL,       -- research_data at the time
  research_sources    JSONB,
  changed_by          UUID,
  change_summary      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_product_profile_version UNIQUE (product_profile_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_product_profile_versions_profile
  ON public.product_profile_versions (product_profile_id, version_number DESC);

-- ---------------------------------------------------------------------------
-- 4. icp_profile_versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.icp_profile_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icp_profile_id   UUID NOT NULL REFERENCES public.icp_profiles(id) ON DELETE CASCADE,
  version_number   INTEGER NOT NULL,
  snapshot         JSONB NOT NULL,          -- criteria at the time
  name_snapshot    TEXT,                    -- name at the time
  description_snapshot TEXT,                -- description at the time
  changed_by       UUID,
  change_summary   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_icp_profile_version UNIQUE (icp_profile_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_icp_profile_versions_profile
  ON public.icp_profile_versions (icp_profile_id, version_number DESC);

-- ---------------------------------------------------------------------------
-- 5. Auto-snapshot trigger for fact profiles
--    Fires BEFORE UPDATE — snapshots OLD state when research_data changes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.snapshot_fact_profile_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only snapshot when research_data actually changes
  IF OLD.research_data IS DISTINCT FROM NEW.research_data THEN
    INSERT INTO public.fact_profile_versions (
      fact_profile_id, version_number, snapshot, research_sources, changed_by, change_summary
    ) VALUES (
      OLD.id,
      OLD.version,
      OLD.research_data,
      OLD.research_sources,
      auth.uid(),
      'Auto-snapshot before update (v' || OLD.version || ')'
    );

    -- Increment version on the new row
    NEW.version := OLD.version + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_fact_profile ON public.client_fact_profiles;

CREATE TRIGGER trg_snapshot_fact_profile
  BEFORE UPDATE ON public.client_fact_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_fact_profile_version();

-- ---------------------------------------------------------------------------
-- 6. Auto-snapshot trigger for product profiles
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.snapshot_product_profile_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.research_data IS DISTINCT FROM NEW.research_data THEN
    INSERT INTO public.product_profile_versions (
      product_profile_id, version_number, snapshot, research_sources, changed_by, change_summary
    ) VALUES (
      OLD.id,
      OLD.version,
      OLD.research_data,
      OLD.research_sources,
      auth.uid(),
      'Auto-snapshot before update (v' || OLD.version || ')'
    );

    NEW.version := OLD.version + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_product_profile ON public.product_profiles;

CREATE TRIGGER trg_snapshot_product_profile
  BEFORE UPDATE ON public.product_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_product_profile_version();

-- ---------------------------------------------------------------------------
-- 7. Auto-snapshot trigger for ICP profiles
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.snapshot_icp_profile_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.criteria IS DISTINCT FROM NEW.criteria
     OR OLD.name IS DISTINCT FROM NEW.name
     OR OLD.description IS DISTINCT FROM NEW.description
  THEN
    -- Ensure icp_profiles has a version column
    INSERT INTO public.icp_profile_versions (
      icp_profile_id, version_number, snapshot, name_snapshot, description_snapshot,
      changed_by, change_summary
    ) VALUES (
      OLD.id,
      COALESCE(
        (SELECT MAX(version_number) + 1 FROM public.icp_profile_versions WHERE icp_profile_id = OLD.id),
        1
      ),
      OLD.criteria,
      OLD.name,
      OLD.description,
      auth.uid(),
      'Auto-snapshot before update'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_icp_profile ON public.icp_profiles;

CREATE TRIGGER trg_snapshot_icp_profile
  BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_icp_profile_version();

-- ---------------------------------------------------------------------------
-- 8. RLS policies for version history tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.fact_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icp_profile_versions ENABLE ROW LEVEL SECURITY;

-- Fact profile versions: org members can SELECT
DO $$ BEGIN
  CREATE POLICY "Org members can view fact profile versions"
  ON public.fact_profile_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_fact_profiles fp
      JOIN public.organization_memberships om ON om.org_id = fp.organization_id
      WHERE fp.id = fact_profile_versions.fact_profile_id
        AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Product profile versions: org members can SELECT
DO $$ BEGIN
  CREATE POLICY "Org members can view product profile versions"
  ON public.product_profile_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_profiles pp
      JOIN public.organization_memberships om ON om.org_id = pp.organization_id
      WHERE pp.id = product_profile_versions.product_profile_id
        AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ICP profile versions: org members can SELECT
DO $$ BEGIN
  CREATE POLICY "Org members can view icp profile versions"
  ON public.icp_profile_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.icp_profiles ip
      JOIN public.organization_memberships om ON om.org_id = ip.organization_id
      WHERE ip.id = icp_profile_versions.icp_profile_id
        AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT policies for trigger (SECURITY DEFINER triggers bypass RLS,
-- but we add INSERT policies for service role / direct inserts)
DO $$ BEGIN
  CREATE POLICY "Service role can insert fact profile versions"
  ON public.fact_profile_versions
  FOR INSERT
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert product profile versions"
  ON public.product_profile_versions
  FOR INSERT
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert icp profile versions"
  ON public.icp_profile_versions
  FOR INSERT
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
