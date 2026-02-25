-- Migration: Dynamic Tables — Enrichment Jobs
-- Purpose: Track AI enrichment job execution and results per column.
-- Date: 2026-02-04

-- =============================================================================
-- enrichment_jobs — Tracks enrichment runs per column
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.dynamic_table_columns(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed', 'cancelled')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  enrichment_prompt TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.enrichment_jobs IS 'Tracks AI enrichment job execution. One job per column enrichment run.';

-- =============================================================================
-- enrichment_job_results — Per-row results within a job
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.enrichment_job_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.enrichment_jobs(id) ON DELETE CASCADE,
  row_id UUID NOT NULL REFERENCES public.dynamic_table_rows(id) ON DELETE CASCADE,
  result TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source TEXT,
  error TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.enrichment_job_results IS 'Individual row results from an enrichment job. Used for retry and audit.';

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_table_id ON public.enrichment_jobs(table_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_column_id ON public.enrichment_jobs(column_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON public.enrichment_jobs(status) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_enrichment_job_results_job_id ON public.enrichment_job_results(job_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_job_results_row_id ON public.enrichment_job_results(row_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_job_results ENABLE ROW LEVEL SECURITY;

-- Jobs: Inherit access from parent table
DO $$ BEGIN
  CREATE POLICY "Users can view enrichment jobs of accessible tables"
  ON public.enrichment_jobs
  FOR SELECT
  USING (
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage enrichment jobs of own tables"
  ON public.enrichment_jobs
  FOR ALL
  USING (
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Results: Inherit from job → table
DO $$ BEGIN
  CREATE POLICY "Users can view job results of accessible tables"
  ON public.enrichment_job_results
  FOR SELECT
  USING (
    job_id IN (
      SELECT j.id FROM public.enrichment_jobs j
      JOIN public.dynamic_tables t ON j.table_id = t.id
      WHERE t.organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage job results of own tables"
  ON public.enrichment_job_results
  FOR ALL
  USING (
    job_id IN (
      SELECT j.id FROM public.enrichment_jobs j
      JOIN public.dynamic_tables t ON j.table_id = t.id
      WHERE t.created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'enrichment_jobs' AND policyname = 'Service role full access to enrichment_jobs'
  ) THEN
    CREATE POLICY "Service role full access to enrichment_jobs"
      ON public.enrichment_jobs FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'enrichment_job_results' AND policyname = 'Service role full access to enrichment_job_results'
  ) THEN
    CREATE POLICY "Service role full access to enrichment_job_results"
      ON public.enrichment_job_results FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
