-- Migration: Agent Columns for Ops Tables
-- Purpose: AI-powered research columns that use agents (Perplexity, Exa, Apify) to research and answer custom questions for each row.
-- Date: 2026-02-12

-- =============================================================================
-- agent_columns — AI research column definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.agent_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ops_table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  output_format TEXT NOT NULL DEFAULT 'free_text' CHECK (output_format IN ('free_text', 'single_value', 'yes_no', 'url', 'list')),
  research_depth TEXT NOT NULL DEFAULT 'medium' CHECK (research_depth IN ('low', 'medium', 'high')),
  source_preferences JSONB NOT NULL DEFAULT '{"perplexity": true, "exa": true, "apify_linkedin": true}'::jsonb,
  auto_route BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_agent_column_name_per_table UNIQUE(ops_table_id, name)
);

COMMENT ON TABLE public.agent_columns IS 'AI research columns for Ops tables. Each column uses AI agents to research and answer custom questions for each row.';
COMMENT ON COLUMN public.agent_columns.prompt_template IS 'Natural language prompt with {{variable}} placeholders (e.g. "Find the latest funding news for {{company_name}}").';
COMMENT ON COLUMN public.agent_columns.output_format IS 'Expected format of the research output: free_text, single_value, yes_no, url, or list.';
COMMENT ON COLUMN public.agent_columns.research_depth IS 'Research depth level: low (quick search), medium (balanced), high (comprehensive research).';
COMMENT ON COLUMN public.agent_columns.source_preferences IS 'JSON object specifying which research sources to use (e.g. {"perplexity": true, "exa": true, "apify_linkedin": false}).';
COMMENT ON COLUMN public.agent_columns.auto_route IS 'If true, automatically route to the best research source based on the prompt; if false, use only enabled source_preferences.';

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_columns_ops_table_id ON public.agent_columns(ops_table_id);
CREATE INDEX IF NOT EXISTS idx_agent_columns_org_id ON public.agent_columns(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_columns_updated_at ON public.agent_columns(organization_id, updated_at DESC);

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_agent_columns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_columns_updated_at
  BEFORE UPDATE ON public.agent_columns
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_columns_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.agent_columns ENABLE ROW LEVEL SECURITY;

-- Users can view agent columns in their org
CREATE POLICY "Users can view org agent columns"
  ON public.agent_columns
  FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Users can create agent columns in their org's tables
CREATE POLICY "Users can create agent columns in org tables"
  ON public.agent_columns
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
    AND ops_table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can update agent columns in their org
CREATE POLICY "Users can update org agent columns"
  ON public.agent_columns
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete agent columns in their org
CREATE POLICY "Users can delete org agent columns"
  ON public.agent_columns
  FOR DELETE
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- Admin full access
-- =============================================================================

CREATE POLICY "Admins have full access to agent columns"
  ON public.agent_columns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND org_id = agent_columns.organization_id
        AND role = 'admin'
    )
  );

-- =============================================================================
-- Service role policies (for edge functions)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_columns' AND policyname = 'Service role full access to agent_columns'
  ) THEN
    CREATE POLICY "Service role full access to agent_columns"
      ON public.agent_columns
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
