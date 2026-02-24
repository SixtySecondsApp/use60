-- Migration: Add agent tracking columns to copilot_executions
-- Purpose: Track which agent handled an execution and parent-child delegation
-- Date: 2026-02-10

-- =============================================================================
-- Add agent columns (all nullable for backward compatibility)
-- =============================================================================

ALTER TABLE copilot_executions
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_execution_id UUID REFERENCES copilot_executions(id),
  ADD COLUMN IF NOT EXISTS delegation_reason TEXT;

-- =============================================================================
-- Index for querying child executions by parent
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_copilot_executions_parent_id
  ON copilot_executions(parent_execution_id)
  WHERE parent_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_executions_agent_name
  ON copilot_executions(agent_name)
  WHERE agent_name IS NOT NULL;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
