-- ============================================================================
-- SCH-001: Add AI columns to tasks table
-- Part of Command Centre unified task system
-- ============================================================================

-- Add AI-related columns to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ai_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deliverable_type TEXT,
  ADD COLUMN IF NOT EXISTS deliverable_data JSONB,
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS reasoning TEXT,
  ADD COLUMN IF NOT EXISTS trigger_event TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_group TEXT;

-- Add CHECK constraints for new columns
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_source_check
  CHECK (source IN (
    'manual',
    'ai_proactive',
    'meeting_transcript',
    'meeting_ai',
    'email_detected',
    'deal_signal',
    'calendar_trigger',
    'copilot',
    'fathom_action_item',
    'slack_suggestion',
    'voice_recording'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_ai_status_check;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_ai_status_check
  CHECK (ai_status IN (
    'none',
    'queued',
    'working',
    'draft_ready',
    'approved',
    'executed',
    'failed',
    'expired'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_deliverable_type_check;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_deliverable_type_check
  CHECK (deliverable_type IN (
    'email_draft',
    'research_brief',
    'meeting_prep',
    'crm_update',
    'content_draft',
    'action_plan',
    'insight'
  ) OR deliverable_type IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_risk_level_check;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_risk_level_check
  CHECK (risk_level IN ('low', 'medium', 'high', 'info'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_confidence_score_check;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_confidence_score_check
  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_ai_status
  ON tasks(assigned_to, ai_status);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_source
  ON tasks(assigned_to, source);

CREATE INDEX IF NOT EXISTS idx_tasks_expires_at
  ON tasks(expires_at)
  WHERE ai_status NOT IN ('approved', 'expired');

-- Add comments
COMMENT ON COLUMN tasks.source IS 'Origin of the task: manual, ai_proactive, meeting_transcript, meeting_ai, email_detected, deal_signal, calendar_trigger, copilot';
COMMENT ON COLUMN tasks.ai_status IS 'AI workflow status: none (default), queued, working, draft_ready, approved, executed, failed, expired';
COMMENT ON COLUMN tasks.deliverable_type IS 'Type of AI deliverable: email_draft, research_brief, meeting_prep, crm_update, content_draft, action_plan, insight';
COMMENT ON COLUMN tasks.deliverable_data IS 'Structured deliverable content (JSONB)';
COMMENT ON COLUMN tasks.risk_level IS 'Risk level for AI suggestions: low, medium, high, info';
COMMENT ON COLUMN tasks.confidence_score IS 'AI confidence score (0.0 to 1.0)';
COMMENT ON COLUMN tasks.reasoning IS 'AI reasoning for the suggested action';
COMMENT ON COLUMN tasks.trigger_event IS 'Event that triggered task creation (e.g., meeting_ended, deal_stale_7d)';
COMMENT ON COLUMN tasks.expires_at IS 'When the task expires if not actioned (for AI suggestions)';
COMMENT ON COLUMN tasks.actioned_at IS 'When the task was approved/dismissed by user';
COMMENT ON COLUMN tasks.auto_group IS 'Auto-grouping key (e.g., company name for collapsible groups)';
