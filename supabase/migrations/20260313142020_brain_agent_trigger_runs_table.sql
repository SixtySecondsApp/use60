-- Migration: brain_agent_trigger_runs_table
-- Date: 20260313142020
--
-- What this migration does:
--   Creates agent_trigger_runs table for trigger execution observability and rate limiting.
--   Referenced by agent-trigger edge function but never created in a migration.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS agent_trigger_runs;

CREATE TABLE IF NOT EXISTS agent_trigger_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID,
  organization_id UUID NOT NULL,
  agent_name TEXT,
  user_id UUID,
  trigger_event TEXT NOT NULL,
  event_payload JSONB DEFAULT '{}'::jsonb,
  success BOOLEAN DEFAULT false,
  response_text TEXT,
  delivered BOOLEAN DEFAULT false,
  duration_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for rate limit queries (10 per org per hour)
CREATE INDEX IF NOT EXISTS idx_agent_trigger_runs_org_created
  ON agent_trigger_runs (organization_id, created_at DESC);

-- Index for per-trigger lookups (ability card stats)
CREATE INDEX IF NOT EXISTS idx_agent_trigger_runs_trigger_id
  ON agent_trigger_runs (trigger_id, created_at DESC)
  WHERE trigger_id IS NOT NULL;

-- Index for per-event queries (replay trail)
CREATE INDEX IF NOT EXISTS idx_agent_trigger_runs_event
  ON agent_trigger_runs (trigger_event, organization_id, created_at DESC);

-- RLS
ALTER TABLE agent_trigger_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on agent_trigger_runs" ON agent_trigger_runs;
CREATE POLICY "Service role full access on agent_trigger_runs"
  ON agent_trigger_runs FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own org trigger runs" ON agent_trigger_runs;
CREATE POLICY "Users can view own org trigger runs"
  ON agent_trigger_runs FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
