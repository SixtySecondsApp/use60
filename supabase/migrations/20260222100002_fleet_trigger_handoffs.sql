-- =============================================================================
-- PRD-02: Fleet Orchestrator — Trigger Handoff Extension
-- Story: FLT-007
-- =============================================================================
-- Adds handoff routing fields to agent_triggers table.
-- After a specialist agent completes, these fields define whether to
-- fire an orchestrator event for downstream processing.
-- =============================================================================

-- Add handoff columns to agent_triggers (all nullable, no behaviour change for existing rows)
ALTER TABLE agent_triggers
  ADD COLUMN IF NOT EXISTS handoff_target_event    TEXT,
  ADD COLUMN IF NOT EXISTS handoff_context_mapping JSONB,
  ADD COLUMN IF NOT EXISTS handoff_conditions      JSONB;

COMMENT ON COLUMN agent_triggers.handoff_target_event    IS 'Optional event type to fire in agent-orchestrator after trigger agent completes';
COMMENT ON COLUMN agent_triggers.handoff_context_mapping IS 'Maps trigger agent output fields to orchestrator event payload fields';
COMMENT ON COLUMN agent_triggers.handoff_conditions      IS 'Conditional handoff — only fire if agent output matches these conditions';
