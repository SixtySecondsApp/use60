-- ============================================================================
-- LOG-001: agent_daily_logs table
-- Structured per-action audit log for autonomous agent fleet operations.
-- Records every classify / draft / send / CRM-update action with outcome,
-- reasoning, credit cost, and execution time for observability dashboards.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create agent_daily_logs table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_daily_logs (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                 UUID          REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable: some agents are org-level

  -- Agent classification
  agent_type              TEXT          NOT NULL,   -- e.g. 'meeting_ended', 'reengagement', 'deal_risk'
  action_type             TEXT          NOT NULL,   -- e.g. 'classify', 'draft_email', 'send_email', 'update_crm'

  -- Payload
  action_detail           JSONB         NOT NULL DEFAULT '{}',  -- flexible per action type

  -- AI transparency
  decision_reasoning      TEXT,                   -- AI reasoning summary (nullable)
  input_context_summary   TEXT,                   -- condensed input context (nullable)

  -- Outcome
  outcome                 TEXT          NOT NULL,
  error_message           TEXT,

  -- Cost & performance
  credit_cost             FLOAT,                  -- AI/API credits consumed (nullable)
  execution_ms            INTEGER,                -- wall-clock time for this action (nullable)

  -- Chain / orchestrator linkage
  chain_id                UUID,                   -- links to orchestrator chain / sequence_job (nullable)
  wave_number             SMALLINT,               -- wave within a chain (nullable)

  -- Timestamps
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_agent_daily_logs_outcome CHECK (
    outcome IN ('success', 'failed', 'pending', 'cancelled', 'skipped')
  )
);

COMMENT ON TABLE public.agent_daily_logs IS
  'Per-action audit log for the autonomous agent fleet. '
  'Each row represents one discrete agent action (classify, draft, send, CRM update, etc.) '
  'with outcome, AI reasoning, credit cost, and execution time. '
  'Retained for 90 days via pg_cron daily cleanup. (LOG-001)';

COMMENT ON COLUMN public.agent_daily_logs.user_id IS
  'Nullable — some agents run at org level with no specific user context.';

COMMENT ON COLUMN public.agent_daily_logs.agent_type IS
  'Identifies the agent that triggered the action, e.g. meeting_ended, reengagement, deal_risk.';

COMMENT ON COLUMN public.agent_daily_logs.action_type IS
  'Identifies the action performed, e.g. classify, draft_email, send_email, update_crm.';

COMMENT ON COLUMN public.agent_daily_logs.action_detail IS
  'Flexible JSONB payload whose schema varies per action_type. '
  'Examples: {subject, body_preview} for draft_email; {field, old_value, new_value} for update_crm.';

COMMENT ON COLUMN public.agent_daily_logs.decision_reasoning IS
  'Human-readable AI reasoning summary explaining why this action was taken.';

COMMENT ON COLUMN public.agent_daily_logs.input_context_summary IS
  'Condensed representation of the input context passed to the agent for this action.';

COMMENT ON COLUMN public.agent_daily_logs.outcome IS
  'Action result: success | failed | pending | cancelled | skipped.';

COMMENT ON COLUMN public.agent_daily_logs.credit_cost IS
  'AI/API credits consumed by this action. NULL when cost is not tracked.';

COMMENT ON COLUMN public.agent_daily_logs.execution_ms IS
  'Wall-clock milliseconds for this action. NULL when not measured.';

COMMENT ON COLUMN public.agent_daily_logs.chain_id IS
  'UUID linking this action to an orchestrator chain or sequence_job run.';

COMMENT ON COLUMN public.agent_daily_logs.wave_number IS
  'Wave number within a multi-wave chain execution. NULL for single-shot actions.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

-- Primary org dashboard: all actions for an org ordered by recency
CREATE INDEX IF NOT EXISTS idx_agent_daily_logs_org_created
  ON public.agent_daily_logs (org_id, created_at DESC);

-- Per-user history and attribution
CREATE INDEX IF NOT EXISTS idx_agent_daily_logs_user_created
  ON public.agent_daily_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Chain linkage: group all actions belonging to one orchestrator run
CREATE INDEX IF NOT EXISTS idx_agent_daily_logs_chain_id
  ON public.agent_daily_logs (chain_id)
  WHERE chain_id IS NOT NULL;

-- Cross-org analytics by agent type over time
CREATE INDEX IF NOT EXISTS idx_agent_daily_logs_agent_type_created
  ON public.agent_daily_logs (agent_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_daily_logs ENABLE ROW LEVEL SECURITY;

-- Org members can read all logs for their org
DO $$ BEGIN
  CREATE POLICY "agent_daily_logs_org_member_select"
  ON public.agent_daily_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = agent_daily_logs.org_id
        AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access for edge function inserts and analytics
DO $$ BEGIN
  CREATE POLICY "agent_daily_logs_service_all"
  ON public.agent_daily_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.agent_daily_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_daily_logs TO service_role;

-- ---------------------------------------------------------------------------
-- 5. pg_cron retention job — delete rows older than 90 days, daily at 3am UTC
-- ---------------------------------------------------------------------------

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if any (idempotent)
    PERFORM cron.unschedule('agent-daily-logs-retention')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-daily-logs-retention');

    -- Schedule: daily at 3:00 AM UTC
    PERFORM cron.schedule(
      'agent-daily-logs-retention',
      '0 3 * * *',
      $cron$
        DELETE FROM public.agent_daily_logs
        WHERE created_at < NOW() - INTERVAL '90 days';
      $cron$
    );

    RAISE NOTICE 'Scheduled agent-daily-logs-retention cron job (daily 3am UTC, 90-day retention)';
  ELSE
    RAISE NOTICE 'pg_cron not available — agent_daily_logs retention must be handled externally';
  END IF;
END $outer$;

-- ---------------------------------------------------------------------------
-- 6. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226900001_agent_daily_logs.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'LOG-001: agent_daily_logs table';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - agent_daily_logs table with 15 columns';
  RAISE NOTICE '  - CHECK constraint: outcome IN (success, failed, pending, cancelled, skipped)';
  RAISE NOTICE '  - idx_agent_daily_logs_org_created     ON (org_id, created_at DESC)';
  RAISE NOTICE '  - idx_agent_daily_logs_user_created    ON (user_id, created_at DESC) WHERE user_id IS NOT NULL';
  RAISE NOTICE '  - idx_agent_daily_logs_chain_id        ON (chain_id) WHERE chain_id IS NOT NULL';
  RAISE NOTICE '  - idx_agent_daily_logs_agent_type_created ON (agent_type, created_at DESC)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies:';
  RAISE NOTICE '  - authenticated: SELECT for org members (organization_memberships join)';
  RAISE NOTICE '  - service_role: full access (INSERT/UPDATE/DELETE for edge functions)';
  RAISE NOTICE '';
  RAISE NOTICE 'pg_cron:';
  RAISE NOTICE '  - agent-daily-logs-retention: DELETE rows older than 90 days, daily 3am UTC';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
