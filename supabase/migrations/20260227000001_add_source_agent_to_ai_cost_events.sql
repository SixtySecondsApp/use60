-- ============================================================================
-- Add source_agent column to ai_cost_events
-- ============================================================================
-- Enables per-agent attribution for AI usage analytics.
-- Distinguishes calls from: copilot-autonomous, api-copilot,
-- autonomous-executor, workflow-node, ar-agent, etc.
-- ============================================================================

ALTER TABLE ai_cost_events
  ADD COLUMN IF NOT EXISTS source_agent TEXT;

-- Partial index for source_agent lookups (only rows that have a value)
CREATE INDEX IF NOT EXISTS idx_ai_cost_events_source_agent
  ON ai_cost_events(source_agent)
  WHERE source_agent IS NOT NULL;

-- Composite index for org + agent breakdown queries
CREATE INDEX IF NOT EXISTS idx_ai_cost_events_org_agent
  ON ai_cost_events(org_id, source_agent);

COMMENT ON COLUMN ai_cost_events.source_agent IS
  'Identifies which agent/executor made this AI call. '
  'Known values: copilot-autonomous, api-copilot, autonomous-executor, '
  'workflow-node, ar-agent, skill-test-console';
