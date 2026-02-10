-- Migration: Apify Integration Core Schema
-- Purpose: Actor schema cache, run tracking, raw results storage
-- Date: 2026-02-10
-- PRD: Apify Integration — Ops Platform

-- =============================================================================
-- Step 1: actor_schema_cache — Cached actor input schemas (24h TTL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.actor_schema_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  input_schema JSONB,
  actor_name TEXT,
  actor_description TEXT,
  default_input JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT actor_schema_cache_org_actor_unique UNIQUE (org_id, actor_id)
);

COMMENT ON TABLE public.actor_schema_cache IS 'Cached Apify actor input schemas. TTL: 24 hours. Re-fetched on cache miss or expiry.';

-- RLS: org members can read, service role full access
ALTER TABLE public.actor_schema_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actor_schema_cache_select"
  ON public.actor_schema_cache
  FOR SELECT
  USING (public.is_service_role() OR public.can_access_org_data(org_id));

CREATE POLICY "actor_schema_cache_service_write"
  ON public.actor_schema_cache
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

-- Index for lookups
CREATE INDEX idx_actor_schema_cache_org_actor
  ON public.actor_schema_cache(org_id, actor_id);

-- =============================================================================
-- Step 2: apify_runs — Tracks each actor execution
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.apify_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT,
  apify_run_id TEXT,
  dataset_id TEXT,
  input_config JSONB,
  mapping_template_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  total_records INTEGER DEFAULT 0,
  mapped_records_count INTEGER DEFAULT 0,
  error_records_count INTEGER DEFAULT 0,
  gdpr_flagged_count INTEGER DEFAULT 0,
  error_message TEXT,
  cost_usd NUMERIC(10,4),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT apify_runs_status_check CHECK (
    status IN ('pending', 'running', 'complete', 'failed', 'partial')
  )
);

COMMENT ON TABLE public.apify_runs IS 'Tracks Apify actor run executions. Each row = one actor run with status, cost, and record counts.';

-- RLS: org members can read, service role full access, creator can delete
ALTER TABLE public.apify_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apify_runs_select"
  ON public.apify_runs
  FOR SELECT
  USING (public.is_service_role() OR public.can_access_org_data(org_id));

CREATE POLICY "apify_runs_insert"
  ON public.apify_runs
  FOR INSERT
  WITH CHECK (public.is_service_role() OR public.can_access_org_data(org_id));

CREATE POLICY "apify_runs_update"
  ON public.apify_runs
  FOR UPDATE
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

CREATE POLICY "apify_runs_delete"
  ON public.apify_runs
  FOR DELETE
  USING (public.is_service_role() OR (auth.uid() = created_by));

-- Indexes
CREATE INDEX idx_apify_runs_org_id ON public.apify_runs(org_id);
CREATE INDEX idx_apify_runs_status ON public.apify_runs(org_id, status);
CREATE INDEX idx_apify_runs_created_at ON public.apify_runs(org_id, created_at DESC);
CREATE INDEX idx_apify_runs_apify_run_id ON public.apify_runs(apify_run_id) WHERE apify_run_id IS NOT NULL;

-- =============================================================================
-- Step 3: apify_results — Raw results from Apify (purged after 30 days)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.apify_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.apify_runs(id) ON DELETE CASCADE,
  raw_data JSONB NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  mapping_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

  CONSTRAINT apify_results_mapping_status_check CHECK (
    mapping_status IN ('pending', 'mapped', 'error', 'skipped')
  )
);

COMMENT ON TABLE public.apify_results IS 'Raw Apify actor output items. Auto-purged after 30 days via cron. Mapping status tracks processing state.';

-- RLS: org members can read, service role full access
ALTER TABLE public.apify_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apify_results_select"
  ON public.apify_results
  FOR SELECT
  USING (public.is_service_role() OR public.can_access_org_data(org_id));

CREATE POLICY "apify_results_service_write"
  ON public.apify_results
  USING (public.is_service_role())
  WITH CHECK (public.is_service_role());

-- Indexes
CREATE INDEX idx_apify_results_run_id ON public.apify_results(run_id);
CREATE INDEX idx_apify_results_run_status ON public.apify_results(run_id, mapping_status);
CREATE INDEX idx_apify_results_expires_at ON public.apify_results(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_apify_results_org_id ON public.apify_results(org_id);
