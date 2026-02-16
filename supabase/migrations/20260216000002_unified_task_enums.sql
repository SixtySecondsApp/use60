-- ============================================================================
-- SCH-002: Update task status and type enums
-- Expand allowed values for status and task_type to support AI workflows
-- ============================================================================

-- Update status CHECK constraint to include new AI workflow statuses
-- Current values: pending, in_progress, completed, cancelled
-- New values: pending_review, ai_working, draft_ready, approved, dismissed, expired
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'cancelled',
    'overdue',
    'pending_review',
    'ai_working',
    'draft_ready',
    'approved',
    'dismissed',
    'expired'
  ));

-- Update task_type CHECK constraint to include new AI action types
-- Current values: follow_up, email, call, proposal (from tasks_task_type_check)
-- New values: research, meeting_prep, crm_update, slack_message, content, alert, insight
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check
  CHECK (task_type IN (
    'call',
    'email',
    'meeting',
    'follow_up',
    'proposal',
    'demo',
    'general',
    'research',
    'meeting_prep',
    'crm_update',
    'slack_message',
    'content',
    'alert',
    'insight'
  ));

-- Also update the type column CHECK constraint (legacy duplicate column)
-- This column appears to be a duplicate of task_type
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check
  CHECK (type IN (
    'call',
    'email',
    'meeting',
    'follow_up',
    'proposal',
    'demo',
    'general',
    'research',
    'meeting_prep',
    'crm_update',
    'slack_message',
    'content',
    'alert',
    'insight'
  ));

-- Add comments for new status values
COMMENT ON CONSTRAINT tasks_status_check ON tasks IS
  'Status workflow: manual (pending→in_progress→completed/cancelled), AI (pending_review→approved→ai_working→draft_ready→completed, or dismissed/expired)';

COMMENT ON CONSTRAINT tasks_task_type_check ON tasks IS
  'Task types: follow_up, email, call, proposal, demo, general (classic), research, meeting_prep, crm_update, slack_message, content, alert, insight (AI-driven)';
