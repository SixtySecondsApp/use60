-- ============================================================
-- Migration: agent_executions
-- Purpose:   Per-agent-run tracking table for fleet observability.
--            Records every autonomous agent execution with timing,
--            model usage, credit consumption, and outcome status.
--            Linked to system_logs via trace_id for full trace
--            correlation (does NOT replace copilot_executions).
-- Story:     OBS2-001
-- Date:      2026-02-22
-- ============================================================

-- ============================================================
-- 1. TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_executions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id          UUID          NOT NULL,
  agent_name        TEXT          NOT NULL,
  execution_type    TEXT          NOT NULL,
  triggered_by      TEXT,
  started_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  status            TEXT          NOT NULL DEFAULT 'running'
                                  CHECK (status IN ('running', 'completed', 'failed', 'partial', 'budget_exceeded')),
  items_emitted     INT           NOT NULL DEFAULT 0,
  items_processed   INT           NOT NULL DEFAULT 0,
  model_id          TEXT,
  model_was_fallback BOOLEAN      NOT NULL DEFAULT false,
  tokens_consumed   INT           NOT NULL DEFAULT 0,
  credits_consumed  NUMERIC(10,4) NOT NULL DEFAULT 0,
  error_message     TEXT,
  metadata          JSONB         NOT NULL DEFAULT '{}'::jsonb,
  user_id           UUID          REFERENCES auth.users (id) ON DELETE SET NULL,
  org_id            UUID          REFERENCES organizations (id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

-- Agent activity timeline (primary operational query)
CREATE INDEX IF NOT EXISTS agent_executions_agent_name_started_at_idx
  ON public.agent_executions (agent_name, started_at);

-- Org-scoped execution history
CREATE INDEX IF NOT EXISTS agent_executions_org_id_started_at_idx
  ON public.agent_executions (org_id, started_at)
  WHERE org_id IS NOT NULL;

-- Trace correlation: join agent runs back to system_logs
CREATE INDEX IF NOT EXISTS agent_executions_trace_id_idx
  ON public.agent_executions (trace_id);

-- Efficient "active executions" queries (only indexes running rows)
CREATE INDEX IF NOT EXISTS agent_executions_running_idx
  ON public.agent_executions (started_at)
  WHERE status = 'running';

-- Flexible metadata querying
CREATE INDEX IF NOT EXISTS agent_executions_metadata_gin_idx
  ON public.agent_executions USING GIN (metadata);

-- ============================================================
-- 3. updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_agent_executions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_executions_updated_at ON public.agent_executions;
CREATE TRIGGER trg_agent_executions_updated_at
  BEFORE UPDATE ON public.agent_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_agent_executions_updated_at();

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

-- Service role has full write access (edge functions record executions)
DROP POLICY IF EXISTS "service_role_insert_agent_executions" ON public.agent_executions;
CREATE POLICY "service_role_insert_agent_executions"
  ON public.agent_executions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_update_agent_executions" ON public.agent_executions;
CREATE POLICY "service_role_update_agent_executions"
  ON public.agent_executions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can view executions belonging to their organisation
DROP POLICY IF EXISTS "org_members_select_agent_executions" ON public.agent_executions;
CREATE POLICY "org_members_select_agent_executions"
  ON public.agent_executions
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM organization_memberships
      WHERE organization_id = agent_executions.org_id
        AND user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. GRANTS
-- ============================================================

GRANT SELECT ON public.agent_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_executions TO service_role;

-- ============================================================
-- 6. COMMENTS
-- ============================================================

COMMENT ON TABLE public.agent_executions IS
  'Records each autonomous agent run for fleet observability (OBS2-001). '
  'One row per agent invocation, capturing timing, model selection, token/credit usage, '
  'and outcome status. Linked to system_logs via trace_id for full distributed trace '
  'correlation. Does NOT replace copilot_executions — both tables coexist.';

COMMENT ON COLUMN public.agent_executions.trace_id IS
  'Distributed trace identifier shared with system_logs and copilot_executions '
  'for correlating all events within one end-to-end request.';

COMMENT ON COLUMN public.agent_executions.agent_name IS
  'Logical agent identifier, e.g. ''copilot'', ''workflow-runner'', ''enrichment-agent''.';

COMMENT ON COLUMN public.agent_executions.execution_type IS
  'Category of work performed, e.g. ''skill_execution'', ''sequence_run'', ''enrichment'', ''routing''.';

COMMENT ON COLUMN public.agent_executions.triggered_by IS
  'What caused this execution: ''user_message'', ''cron'', ''webhook'', ''workflow_node'', etc.';

COMMENT ON COLUMN public.agent_executions.status IS
  'Terminal or transient state: running | completed | failed | partial | budget_exceeded. '
  '''partial'' means the agent produced some output but did not finish all steps. '
  '''budget_exceeded'' means the run was halted due to token or credit limits.';

COMMENT ON COLUMN public.agent_executions.items_emitted IS
  'Number of output items produced by this agent run (e.g. contacts enriched, tasks created).';

COMMENT ON COLUMN public.agent_executions.items_processed IS
  'Number of input items consumed during this run (e.g. leads scanned, messages parsed).';

COMMENT ON COLUMN public.agent_executions.model_id IS
  'Provider model identifier actually used, e.g. ''claude-haiku-4-5-20251001''. '
  'May differ from the configured primary if a fallback was selected.';

COMMENT ON COLUMN public.agent_executions.model_was_fallback IS
  'True when the model_id is a circuit-breaker fallback rather than the configured primary.';

COMMENT ON COLUMN public.agent_executions.tokens_consumed IS
  'Total tokens (prompt + completion) consumed by LLM calls during this run.';

COMMENT ON COLUMN public.agent_executions.credits_consumed IS
  'Internal platform credits consumed, computed from model credit_cost × usage.';

COMMENT ON COLUMN public.agent_executions.error_message IS
  'Human-readable error description when status = ''failed'' or ''partial''. NULL otherwise.';

COMMENT ON COLUMN public.agent_executions.metadata IS
  'Arbitrary structured context attached to the run: skill name, sequence id, input params, '
  'intermediate tool calls, etc. Indexed with GIN for flexible ad-hoc querying.';

COMMENT ON COLUMN public.agent_executions.updated_at IS
  'Last time this row was modified (auto-maintained by trigger). '
  'Useful for detecting stale ''running'' rows that may indicate crashed agents.';
