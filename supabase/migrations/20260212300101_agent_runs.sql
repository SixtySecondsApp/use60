-- Migration: Agent Runs — Research Execution Tracking
-- Purpose: Tracks individual cell executions for AI Research Agent columns
-- Date: 2026-02-12
-- Story: AGNT-002

-- =============================================================================
-- agent_runs — Individual research task executions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_column_id UUID NOT NULL REFERENCES public.agent_columns(id) ON DELETE CASCADE,
  row_id UUID NOT NULL REFERENCES public.dynamic_table_rows(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'complete', 'failed')),
  depth_level_used TEXT NOT NULL DEFAULT 'medium' CHECK (depth_level_used IN ('low', 'medium', 'high')),
  result_text TEXT,
  result_structured JSONB,
  sources JSONB,
  providers_used TEXT[],
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  token_cost INTEGER,
  credit_cost INTEGER,
  error_message TEXT,
  chain_log JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  CONSTRAINT unique_agent_run_per_cell UNIQUE(agent_column_id, row_id)
);

COMMENT ON TABLE public.agent_runs IS 'Individual research task executions for AI Research Agent columns. Each row represents one research task for one entity row × one agent column.';
COMMENT ON COLUMN public.agent_runs.result_text IS 'Free-text research result (for free_text, single_value, url output formats).';
COMMENT ON COLUMN public.agent_runs.result_structured IS 'Structured research result for list/yes_no output formats. Format: { type: "list", items: [...] } or { type: "yes_no", answer: true/false, reasoning: "..." }';
COMMENT ON COLUMN public.agent_runs.sources IS 'Array of sources used in research. Format: [{ url, title, provider }]';
COMMENT ON COLUMN public.agent_runs.providers_used IS 'List of research providers used (e.g. ["exa", "perplexity"]).';
COMMENT ON COLUMN public.agent_runs.confidence IS 'AI confidence in the result (high/medium/low).';
COMMENT ON COLUMN public.agent_runs.token_cost IS 'Total token cost for this research task (LLM tokens).';
COMMENT ON COLUMN public.agent_runs.credit_cost IS 'Total credit cost for this research task (search API credits).';
COMMENT ON COLUMN public.agent_runs.chain_log IS 'For High depth: ordered log of each provider step. Format: [{ step: 1, provider: "exa", query: "...", results_count: 5, timestamp: "..." }]';

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_runs_column_status ON public.agent_runs(agent_column_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_cell_lookup ON public.agent_runs(agent_column_id, row_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON public.agent_runs(created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- Users can view agent runs for tables in their org (via agent_column join)
CREATE POLICY "Users can view org agent runs"
  ON public.agent_runs
  FOR SELECT
  USING (
    agent_column_id IN (
      SELECT ac.id FROM public.agent_columns ac
      JOIN public.dynamic_tables dt ON dt.id = ac.ops_table_id
      WHERE dt.organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can create agent runs for their org's tables
CREATE POLICY "Users can create org agent runs"
  ON public.agent_runs
  FOR INSERT
  WITH CHECK (
    agent_column_id IN (
      SELECT ac.id FROM public.agent_columns ac
      JOIN public.dynamic_tables dt ON dt.id = ac.ops_table_id
      WHERE dt.organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can update agent runs for their org's tables
CREATE POLICY "Users can update org agent runs"
  ON public.agent_runs
  FOR UPDATE
  USING (
    agent_column_id IN (
      SELECT ac.id FROM public.agent_columns ac
      JOIN public.dynamic_tables dt ON dt.id = ac.ops_table_id
      WHERE dt.organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can delete agent runs for their org's tables
CREATE POLICY "Users can delete org agent runs"
  ON public.agent_runs
  FOR DELETE
  USING (
    agent_column_id IN (
      SELECT ac.id FROM public.agent_columns ac
      JOIN public.dynamic_tables dt ON dt.id = ac.ops_table_id
      WHERE dt.organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- =============================================================================
-- Service role policies (for edge functions)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_runs' AND policyname = 'Service role full access to agent_runs'
  ) THEN
    CREATE POLICY "Service role full access to agent_runs"
      ON public.agent_runs
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
