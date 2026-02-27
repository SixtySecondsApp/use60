-- Migration: Apify Mapping Engine Schema
-- Purpose: Mapping templates and mapped records for Apify results processing
-- Date: 2026-02-10
-- PRD: Apify Integration — Ops Platform (Phase 2)

-- =============================================================================
-- Step 1: mapping_templates — Reusable field mapping configurations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mapping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  actor_id TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  field_mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
  dedup_key TEXT,
  transform_pipeline JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.mapping_templates IS 'Reusable field mapping templates for Apify actor outputs. System templates (org_id IS NULL, is_system=true) are available to all orgs.';

-- RLS: org members can read own + system templates, service role full access
ALTER TABLE public.mapping_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "mapping_templates_select"
  ON public.mapping_templates
  FOR SELECT
  USING (
    public.is_service_role()
    OR (org_id IS NULL AND is_system = true)
    OR public.can_access_org_data(org_id)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mapping_templates_insert"
  ON public.mapping_templates
  FOR INSERT
  WITH CHECK (
    public.is_service_role()
    OR public.can_access_org_data(org_id)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mapping_templates_update"
  ON public.mapping_templates
  FOR UPDATE
  USING (
    public.is_service_role()
    OR (public.can_access_org_data(org_id) AND is_system = false)
  )
  WITH CHECK (
    public.is_service_role()
    OR (public.can_access_org_data(org_id) AND is_system = false)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mapping_templates_delete"
  ON public.mapping_templates
  FOR DELETE
  USING (
    public.is_service_role()
    OR (public.can_access_org_data(org_id) AND is_system = false)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX idx_mapping_templates_org_id ON public.mapping_templates(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_mapping_templates_system ON public.mapping_templates(is_system) WHERE is_system = true;
CREATE INDEX idx_mapping_templates_actor ON public.mapping_templates(actor_id) WHERE actor_id IS NOT NULL;

-- =============================================================================
-- Step 2: mapped_records — Processed records from Apify results
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mapped_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.apify_runs(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.mapping_templates(id) ON DELETE SET NULL,
  source_result_id UUID REFERENCES public.apify_results(id) ON DELETE SET NULL,
  mapped_data JSONB NOT NULL,
  dedup_key TEXT,
  gdpr_flags TEXT[] DEFAULT '{}',
  mapping_confidence TEXT DEFAULT 'medium',
  synced_to_crm BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT mapped_records_confidence_check CHECK (
    mapping_confidence IN ('high', 'medium', 'low')
  )
);

COMMENT ON TABLE public.mapped_records IS 'Processed/mapped records from Apify results. Contains normalized data ready for CRM sync or export.';

-- RLS: org members can read, service role full access
ALTER TABLE public.mapped_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "mapped_records_select"
  ON public.mapped_records
  FOR SELECT
  USING (public.is_service_role() OR public.can_access_org_data(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "mapped_records_service_write"
  ON public.mapped_records
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX idx_mapped_records_org_id ON public.mapped_records(org_id);
CREATE INDEX idx_mapped_records_run_id ON public.mapped_records(run_id);
CREATE INDEX idx_mapped_records_dedup ON public.mapped_records(org_id, dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX idx_mapped_records_gdpr ON public.mapped_records(org_id) WHERE array_length(gdpr_flags, 1) > 0;
CREATE INDEX idx_mapped_records_template ON public.mapped_records(template_id) WHERE template_id IS NOT NULL;

-- =============================================================================
-- Step 3: Seed system mapping templates
-- =============================================================================

INSERT INTO public.mapping_templates (org_id, name, description, actor_id, is_system, field_mappings, dedup_key)
VALUES
  (
    NULL,
    'Google Maps Lead Gen',
    'Maps Google Maps scraper output (place details, contact info, reviews) to standard lead fields.',
    NULL,
    true,
    '[
      {"source": "title", "target": "company_name", "confidence": "high"},
      {"source": "address", "target": "address", "confidence": "high"},
      {"source": "phone", "target": "phone", "transform": "normalise_phone", "confidence": "high"},
      {"source": "website", "target": "website", "transform": "extract_domain", "confidence": "high"},
      {"source": "categoryName", "target": "industry", "confidence": "medium"},
      {"source": "totalScore", "target": "rating", "confidence": "high"},
      {"source": "reviewsCount", "target": "review_count", "transform": "to_integer", "confidence": "high"},
      {"source": "url", "target": "google_maps_url", "confidence": "high"},
      {"source": "email", "target": "email", "transform": "lowercase", "confidence": "medium"},
      {"source": "location.lat", "target": "latitude", "transform": "to_float", "confidence": "high"},
      {"source": "location.lng", "target": "longitude", "transform": "to_float", "confidence": "high"}
    ]'::jsonb,
    'url'
  ),
  (
    NULL,
    'Website Contact Extraction',
    'Maps website crawler contact extraction output to standard contact fields.',
    NULL,
    true,
    '[
      {"source": "name", "target": "full_name", "confidence": "high"},
      {"source": "firstName", "target": "first_name", "confidence": "high"},
      {"source": "lastName", "target": "last_name", "confidence": "high"},
      {"source": "email", "target": "email", "transform": "lowercase", "confidence": "high"},
      {"source": "phone", "target": "phone", "transform": "normalise_phone", "confidence": "medium"},
      {"source": "title", "target": "job_title", "confidence": "medium"},
      {"source": "company", "target": "company_name", "confidence": "medium"},
      {"source": "linkedinUrl", "target": "linkedin_url", "confidence": "high"},
      {"source": "twitterUrl", "target": "twitter_url", "confidence": "medium"},
      {"source": "source", "target": "source_url", "confidence": "high"}
    ]'::jsonb,
    'email'
  )
ON CONFLICT DO NOTHING;
