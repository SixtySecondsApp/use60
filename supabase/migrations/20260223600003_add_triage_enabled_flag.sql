-- ============================================================================
-- Migration: Add triage_enabled flag to proactive_agent_config
-- Purpose: Feature flag for triage layer (AOA-004)
-- Story: AOA-004
-- Date: 2026-02-24
-- ============================================================================

ALTER TABLE proactive_agent_config
  ADD COLUMN IF NOT EXISTS triage_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN proactive_agent_config.triage_enabled IS
  'When true, agent outputs route through notification_queue triage engine instead of direct Slack delivery. Defaults to false for backward compatibility.';
