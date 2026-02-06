-- Add workflow telemetry columns to copilot_analytics
-- Date: 2026-01-24
-- Story: US-014
--
-- Adds columns to track per-workflow metrics:
-- - workflow_type: The V1 workflow type (catch_me_up, next_meeting_prep, etc.)
-- - workflow_sequence_key: The sequence key (seq-catch-me-up, etc.)
-- - is_deterministic_workflow: Whether Gemini was skipped
-- - structured_response_type: The type of structured response (daily_brief, etc.)
-- - workflow_step_count: Number of tool executions
-- - workflow_duration_ms: Total workflow duration
-- - is_preview_flow: Whether this is a simulation/preview
-- - pending_action_created: Whether pending_action was saved
-- - error_category: Categorized error type for filtering

BEGIN;

-- Add workflow tracking columns
ALTER TABLE copilot_analytics 
  ADD COLUMN IF NOT EXISTS workflow_type TEXT,
  ADD COLUMN IF NOT EXISTS workflow_sequence_key TEXT,
  ADD COLUMN IF NOT EXISTS is_deterministic_workflow BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS structured_response_type TEXT,
  ADD COLUMN IF NOT EXISTS has_structured_response BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS workflow_step_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workflow_duration_ms INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workflow_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_preview_flow BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_action_created BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_category TEXT;

-- Add index for workflow analytics queries
CREATE INDEX IF NOT EXISTS idx_copilot_analytics_workflow_type 
  ON copilot_analytics(workflow_type) 
  WHERE workflow_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_analytics_structured_response_type 
  ON copilot_analytics(structured_response_type) 
  WHERE structured_response_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_analytics_error_category 
  ON copilot_analytics(error_category) 
  WHERE error_category IS NOT NULL;

-- Add composite index for confirmation rate analysis
CREATE INDEX IF NOT EXISTS idx_copilot_analytics_preview_flow 
  ON copilot_analytics(workflow_type, is_preview_flow, pending_action_created) 
  WHERE is_preview_flow = true;

COMMENT ON COLUMN copilot_analytics.workflow_type IS 'V1 workflow type: catch_me_up, next_meeting_prep, post_meeting_followup, email_zero_inbox, pipeline_focus';
COMMENT ON COLUMN copilot_analytics.workflow_sequence_key IS 'Sequence key if a sequence was run: seq-catch-me-up, seq-next-meeting-command-center, etc.';
COMMENT ON COLUMN copilot_analytics.is_deterministic_workflow IS 'True if Gemini was skipped for deterministic routing';
COMMENT ON COLUMN copilot_analytics.structured_response_type IS 'Type of structured response returned: daily_brief, next_meeting_command_center, etc.';
COMMENT ON COLUMN copilot_analytics.workflow_step_count IS 'Number of tool executions in this request';
COMMENT ON COLUMN copilot_analytics.is_preview_flow IS 'True if response was is_simulation=true (preview before confirm)';
COMMENT ON COLUMN copilot_analytics.pending_action_created IS 'True if a pending_action was saved for confirmation';
COMMENT ON COLUMN copilot_analytics.error_category IS 'Categorized error type: timeout, rate_limit, auth, not_found, validation, network, internal';

COMMIT;
