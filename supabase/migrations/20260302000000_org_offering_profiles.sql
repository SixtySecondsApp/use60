-- Migration: OFR-001 — Create org_offering_profiles table with RLS
-- Purpose: Stores structured offering profiles per org — products, services, case studies,
--          pricing models, and differentiators used as context for proposal generation.
-- Date: 2026-03-02

-- =============================================================================
-- Step 1: Create org_offering_profiles table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_offering_profiles (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name                 text        NOT NULL,
    description          text,
    products_json        jsonb       DEFAULT '[]'::jsonb,
    services_json        jsonb       DEFAULT '[]'::jsonb,
    case_studies_json    jsonb       DEFAULT '[]'::jsonb,
    pricing_models_json  jsonb       DEFAULT '[]'::jsonb,
    differentiators_json jsonb       DEFAULT '[]'::jsonb,
    source_document_id   uuid        REFERENCES public.proposal_assets(id) ON DELETE SET NULL,
    is_active            boolean     DEFAULT true,
    created_by           uuid        REFERENCES auth.users(id),
    created_at           timestamptz DEFAULT now(),
    updated_at           timestamptz DEFAULT now()
);

COMMENT ON TABLE public.org_offering_profiles IS 'Structured offering profiles per org. Stores products, services, case studies, pricing models, and differentiators used as AI context during proposal generation.';
COMMENT ON COLUMN public.org_offering_profiles.org_id IS 'FK to organizations; scopes this profile to a specific org.';
COMMENT ON COLUMN public.org_offering_profiles.name IS 'Human-readable name for this offering profile (e.g. "Enterprise SaaS Package").';
COMMENT ON COLUMN public.org_offering_profiles.description IS 'Optional description shown in the profile picker UI.';
COMMENT ON COLUMN public.org_offering_profiles.products_json IS 'JSONB array of product objects: [{name, description, key_features[], pricing}].';
COMMENT ON COLUMN public.org_offering_profiles.services_json IS 'JSONB array of service objects: [{name, description, deliverables[], duration}].';
COMMENT ON COLUMN public.org_offering_profiles.case_studies_json IS 'JSONB array of case study objects: [{title, client, challenge, solution, outcome}].';
COMMENT ON COLUMN public.org_offering_profiles.pricing_models_json IS 'JSONB array of pricing model objects: [{model, tiers[], currency, billing_cadence}].';
COMMENT ON COLUMN public.org_offering_profiles.differentiators_json IS 'JSONB array of differentiator strings or objects: [{headline, detail}].';
COMMENT ON COLUMN public.org_offering_profiles.source_document_id IS 'Optional FK to proposal_assets; the source document this profile was extracted from.';
COMMENT ON COLUMN public.org_offering_profiles.is_active IS 'Soft-delete flag. Only active profiles are offered in the proposal builder.';
COMMENT ON COLUMN public.org_offering_profiles.created_by IS 'FK to auth.users; the user who created this profile.';

-- =============================================================================
-- Step 2: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_org_offering_profiles_org_id
    ON public.org_offering_profiles (org_id);

CREATE INDEX IF NOT EXISTS idx_org_offering_profiles_is_active
    ON public.org_offering_profiles (org_id, is_active);

CREATE INDEX IF NOT EXISTS idx_org_offering_profiles_created_by
    ON public.org_offering_profiles (created_by);

-- =============================================================================
-- Step 3: updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_org_offering_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trigger_update_org_offering_profiles_updated_at
        BEFORE UPDATE ON public.org_offering_profiles
        FOR EACH ROW
        EXECUTE FUNCTION public.update_org_offering_profiles_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 4: Row Level Security
-- =============================================================================

ALTER TABLE public.org_offering_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: any org member can view their org's offering profiles
DO $$ BEGIN
    CREATE POLICY "Org members can view offering profiles"
    ON public.org_offering_profiles
    FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM public.organization_memberships
            WHERE user_id = auth.uid()
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT: org members can create profiles (created_by must match caller)
DO $$ BEGIN
    CREATE POLICY "Org members can create offering profiles"
    ON public.org_offering_profiles
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid()
        AND org_id IN (
            SELECT org_id FROM public.organization_memberships
            WHERE user_id = auth.uid()
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- UPDATE: creator or org admin/owner can update
DO $$ BEGIN
    CREATE POLICY "Creator or admin can update offering profiles"
    ON public.org_offering_profiles
    FOR UPDATE
    USING (
        created_by = auth.uid()
        OR org_id IN (
            SELECT org_id FROM public.organization_memberships
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DELETE: creator or org admin/owner can delete
DO $$ BEGIN
    CREATE POLICY "Creator or admin can delete offering profiles"
    ON public.org_offering_profiles
    FOR DELETE
    USING (
        created_by = auth.uid()
        OR org_id IN (
            SELECT org_id FROM public.organization_memberships
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role bypass for edge functions and cron jobs
DO $$ BEGIN
    CREATE POLICY "Service role full access to offering profiles"
    ON public.org_offering_profiles
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
